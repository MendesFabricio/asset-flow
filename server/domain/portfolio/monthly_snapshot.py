import calendar
import json
import logging
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Callable, Dict, Optional

from sqlalchemy import event, func

from db.models import Asset, AssetTransaction, Category, MarketData, MonthlyPortfolioSnapshot
from db.session import Session  # noqa: F401 - kept for backwards compatibility
from utils.ticker_helper import extract_option_meta, get_yf_historical_proxy

_IGNORED_PROXY_TICKERS = frozenset({"VIVR1", "XPAR3", "CCTY1", "GGRC12", "IRIM15", "HGTX3"})


def _to_date(val) -> Optional[date]:
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.date()
    if isinstance(val, date):
        return val
    if isinstance(val, str):
        try:
            return date.fromisoformat(val.split(" ")[0][:10])
        except ValueError:
            return None
    return None


def _get_historical_price(session, asset_id: int, target_date: date, price_cache: dict = None) -> Decimal:
    """Gets the closest price for an asset on or before target_date."""
    if price_cache is not None:
        asset_prices = price_cache.get(asset_id)
        if asset_prices:
            curr = target_date
            for _ in range(30):
                if curr in asset_prices:
                    return Decimal(str(round(asset_prices[curr], 6)))
                curr -= timedelta(days=1)
        return Decimal("0.0")

    md = (
        session.query(MarketData)
        .filter(
            MarketData.asset_id == asset_id,
            func.date(MarketData.date) <= target_date,
        )
        .order_by(MarketData.date.desc())
        .first()
    )

    if md and md.price:
        return Decimal(md.price)
    return Decimal("0.0")


def _extract_symbol_history(batch_data, symbol: str, download_count: int):
    import pandas as pd

    if batch_data is None or getattr(batch_data, "empty", True):
        return pd.DataFrame()
    if isinstance(batch_data.columns, pd.MultiIndex):
        if symbol in batch_data.columns.levels[0]:
            return batch_data[symbol]
        return pd.DataFrame()
    if download_count == 1:
        return batch_data
    if symbol in batch_data.columns:
        return batch_data[symbol]
    return pd.DataFrame()


def build_historical_price_cache(
    session,
    user_id: int,
    progress_cb: Optional[Callable[[str], None]] = None,
) -> Dict[int, Dict[date, float]]:
    """
    Downloads 10y unadjusted-for-future-splits daily close series per asset and restores
    pre-event nominal prices using Yahoo 'Stock Splits' aligned to DB event dates.
    Also linearly interpolates Reserva assets from purchase to latest MarketData.
    """
    rows = (
        session.query(AssetTransaction, Asset, Category)
        .join(Asset, AssetTransaction.ticker == Asset.ticker)
        .outerjoin(Category, Asset.category_id == Category.id)
        .filter(AssetTransaction.user_id == user_id)
        .order_by(AssetTransaction.transaction_date.asc(), AssetTransaction.id.asc())
        .all()
    )

    user_assets: Dict[int, Asset] = {}
    category_map: Dict[int, str] = {}
    by_asset_txs: Dict[int, list] = {}
    for tx, asset, cat in rows:
        user_assets[asset.id] = asset
        category_map[asset.id] = cat.name if cat else "Outros"
        by_asset_txs.setdefault(asset.id, []).append(tx)

    md_cache: Dict[int, Dict[date, float]] = {aid: {} for aid in user_assets}
    symbol_to_assets: Dict[str, list] = {}

    for aid, asset in user_assets.items():
        t_raw = (asset.ticker or "").strip().upper()
        if (
            not t_raw
            or len(t_raw) > 7
            or " " in t_raw
            or extract_option_meta(t_raw)
            or t_raw in _IGNORED_PROXY_TICKERS
        ):
            continue
        sym, factor, max_date_iso = get_yf_historical_proxy(t_raw, category_map.get(aid, ""))
        max_dt = _to_date(max_date_iso) if max_date_iso else None
        symbol_to_assets.setdefault(sym, []).append((asset, factor, max_dt))

    download_list = sorted(symbol_to_assets.keys())
    if download_list:
        if progress_cb:
            progress_cb(f"Baixando histórico de {len(download_list)} ativos (10 anos)...")
        try:
            import pandas as pd
            import yfinance as yf

            batch_data = yf.download(
                download_list,
                period="10y",
                group_by="ticker",
                threads=False,
                progress=False,
                auto_adjust=False,
                actions=True,
            )
            for sym, targets in symbol_to_assets.items():
                raw_hist = _extract_symbol_history(batch_data, sym, len(download_list))
                if raw_hist.empty or "Close" not in raw_hist.columns:
                    continue
                hist = raw_hist.dropna(subset=["Close"])
                if hist.empty:
                    continue

                yf_splits = []
                if "Stock Splits" in hist.columns:
                    for idx, val in hist["Stock Splits"].items():
                        if pd.notna(val) and float(val) > 0:
                            sp_dt = _to_date(idx)
                            if sp_dt is not None:
                                yf_splits.append((sp_dt, float(val)))

                for asset, factor, max_dt in targets:
                    db_event_dates = [
                        d
                        for tx in by_asset_txs.get(asset.id, [])
                        if (tx.type or "").upper() in ("SPLIT", "INPLIT", "BONUS")
                        and (d := _to_date(tx.transaction_date)) is not None
                    ]
                    eff_splits = []
                    for yf_dt, ratio in yf_splits:
                        matched_dt = next(
                            (d for d in db_event_dates if abs((d - yf_dt).days) <= 10),
                            yf_dt,
                        )
                        eff_splits.append((matched_dt, ratio))

                    for date_idx, row in hist.iterrows():
                        dt = _to_date(date_idx)
                        if dt is None:
                            continue
                        if max_dt is not None and dt > max_dt:
                            continue
                        price = float(row["Close"]) * factor
                        for eff_dt, ratio in eff_splits:
                            if dt < eff_dt:
                                price *= ratio
                        md_cache[asset.id][dt] = price
        except Exception as exc:
            logging.error(f"Error building historical price cache: {exc}", exc_info=True)

    # Linear interpolation for Reserva (Caixinhas/CDBs without public ticker)
    for aid, asset in user_assets.items():
        if category_map.get(aid) != "Reserva" or md_cache[aid]:
            continue
        asset_txs = by_asset_txs.get(aid, [])
        latest_md = (
            session.query(MarketData)
            .filter_by(asset_id=aid)
            .order_by(MarketData.date.desc())
            .first()
        )
        if not asset_txs or not latest_md or not latest_md.price:
            continue
        first_d = _to_date(asset_txs[0].transaction_date)
        last_d = _to_date(latest_md.date)
        p0 = float(asset_txs[0].unit_price or 0)
        p1 = float(latest_md.price)
        if first_d and last_d and p0 > 0 and p1 > 0 and last_d > first_d:
            total_days = (last_d - first_d).days
            for step in range(total_days + 1):
                d = first_d + timedelta(days=step)
                md_cache[aid][d] = p0 + (p1 - p0) * (step / total_days)

    return md_cache


def apply_transaction_to_position_state(pos: dict, tx, use_decimal: bool = True) -> None:
    """Applies any AssetTransaction (trade or corporate event) to a running position state."""
    zero = Decimal("0.0") if use_decimal else 0.0
    eps = Decimal("0.0001") if use_decimal else 0.0001
    conv = Decimal if use_decimal else float

    qty = conv(tx.quantity or 0)
    unit_price = conv(tx.unit_price or 0)
    val = conv(tx.total_value or 0)
    tx_type = (tx.type or "").upper()

    if tx_type in ("BUY", "TICKER_CHANGE_IN", "SPIN_OFF_RECEIPT"):
        pos["quantity"] += qty
        pos["total_cost"] += val
    elif tx_type in ("SELL", "TICKER_CHANGE_OUT"):
        if pos["quantity"] > zero:
            avg_price = pos["total_cost"] / pos["quantity"]
            pos["quantity"] -= qty
            pos["total_cost"] -= avg_price * qty
            if pos["quantity"] <= eps:
                pos["quantity"] = zero
                pos["total_cost"] = zero
    elif tx_type in ("SPLIT", "INPLIT", "BONUS", "SPIN_OFF"):
        pos["quantity"] = qty
        if unit_price > zero or qty == zero:
            pos["total_cost"] = qty * unit_price
    elif tx_type == "AMORTIZATION":
        pos["total_cost"] = max(zero, pos["total_cost"] - val)


def generate_or_update_monthly_snapshot(
    session, user_id: int, year: int, month: int, price_cache: dict = None
) -> MonthlyPortfolioSnapshot:
    last_day = calendar.monthrange(year, month)[1]
    start_date = date(year, month, 1)
    end_date = date(year, month, last_day)
    prev_end_date = start_date - timedelta(days=1)

    txs = (
        session.query(AssetTransaction, Asset, Category)
        .join(Asset, AssetTransaction.ticker == Asset.ticker)
        .outerjoin(Category, Asset.category_id == Category.id)
        .filter(
            AssetTransaction.user_id == user_id,
            func.date(AssetTransaction.transaction_date) <= end_date,
        )
        .order_by(AssetTransaction.transaction_date.asc(), AssetTransaction.id.asc())
        .all()
    )

    portfolio: Dict[int, Dict[str, Decimal]] = {}
    asset_map: Dict[int, str] = {}
    category_map: Dict[int, str] = {}
    month_txs = []

    for tx, asset, cat in txs:
        asset_map[asset.id] = asset.ticker
        category_map[asset.id] = cat.name if cat else "Outros"
        if asset.id not in portfolio:
            portfolio[asset.id] = {
                "quantity": Decimal("0.0"),
                "total_cost": Decimal("0.0"),
            }
        tx_d = _to_date(tx.transaction_date)
        if tx_d is not None and tx_d < start_date:
            apply_transaction_to_position_state(portfolio[asset.id], tx, use_decimal=True)
        elif tx_d is not None and start_date <= tx_d <= end_date:
            month_txs.append((tx, asset))

    # 1. Start-of-month market value per asset (using prev_end_date)
    eps = Decimal("0.0001")
    m_start: Dict[int, Decimal] = {}
    for aid, pos in portfolio.items():
        if pos["quantity"] > eps:
            price_start = _get_historical_price(session, aid, prev_end_date, price_cache)
            if price_start == Decimal("0.0"):
                price_start = pos["total_cost"] / pos["quantity"]
            m_start[aid] = pos["quantity"] * price_start

    # 2. Replay current month transactions tracking cash flows, realized PnL, and corporate reorgs
    net_flows: Dict[int, Decimal] = {}
    realized_pnl = Decimal("0.0")
    pending_tc_out: Dict[int, int] = {}
    spin_parent_by_ce: Dict[int, int] = {}

    for tx, asset in month_txs:
        aid = asset.id
        net_flows.setdefault(aid, Decimal("0.0"))
        ttype = (tx.type or "").upper()
        val = Decimal(str(tx.total_value or 0))
        qty = Decimal(str(tx.quantity or 0))
        ce_id = tx.corporate_event_id

        if ttype == "BUY":
            net_flows[aid] += val
        elif ttype == "SELL":
            net_flows[aid] -= val
            if portfolio[aid]["quantity"] > eps:
                avg_cost = portfolio[aid]["total_cost"] / portfolio[aid]["quantity"]
            else:
                avg_cost = Decimal(str(tx.cost_basis or 0))
            realized_pnl += val - (avg_cost * qty)
        elif ttype in ("SPIN_OFF", "BONUS") and ce_id:
            spin_parent_by_ce[ce_id] = aid
        elif ttype == "SPIN_OFF_RECEIPT" and ce_id:
            parent_aid = spin_parent_by_ce.get(ce_id)
            if parent_aid is not None and parent_aid != aid:
                net_flows[aid] += val
                net_flows.setdefault(parent_aid, Decimal("0.0"))
                net_flows[parent_aid] -= val
        elif ttype == "TICKER_CHANGE_OUT" and ce_id:
            pending_tc_out[ce_id] = aid
        elif ttype == "TICKER_CHANGE_IN" and ce_id:
            old_aid = pending_tc_out.get(ce_id)
            if old_aid is not None and old_aid != aid:
                m_start[aid] = m_start.get(aid, Decimal("0.0")) + m_start.get(old_aid, Decimal("0.0"))
                net_flows[aid] = net_flows.get(aid, Decimal("0.0")) + net_flows.get(old_aid, Decimal("0.0"))
                m_start[old_aid] = Decimal("0.0")
                net_flows[old_aid] = Decimal("0.0")

        apply_transaction_to_position_state(portfolio[aid], tx, use_decimal=True)

    # 3. End-of-month market value and exact per-asset variation: (M_end - M_start) - net_flows
    total_invested_cost = Decimal("0.0")
    total_market_value = Decimal("0.0")
    m_end: Dict[int, Decimal] = {}

    for aid, pos in portfolio.items():
        if pos["quantity"] > eps:
            total_invested_cost += pos["total_cost"]
            price_end = _get_historical_price(session, aid, end_date, price_cache)
            if price_end == Decimal("0.0"):
                price_end = pos["total_cost"] / pos["quantity"]
            mkt_val = pos["quantity"] * price_end
            m_end[aid] = mkt_val
            total_market_value += mkt_val

    unrealized_pnl = total_market_value - total_invested_cost

    all_asset_ids = set(m_start.keys()) | set(m_end.keys()) | set(net_flows.keys())
    month_variation_total = Decimal("0.0")
    asset_performances = []

    for aid in all_asset_ids:
        var_dec = (m_end.get(aid, Decimal("0.0")) - m_start.get(aid, Decimal("0.0"))) - net_flows.get(
            aid, Decimal("0.0")
        )
        month_variation_total += var_dec
        var_float = round(float(var_dec), 2)
        if abs(var_float) >= 0.01 and category_map.get(aid) != "Reserva":
            asset_performances.append({
                "ticker": asset_map[aid],
                "variation": var_float,
            })

    asset_performances.sort(key=lambda x: x["variation"])
    top_losers = [p for p in asset_performances[:3] if p["variation"] < 0]
    top_gainers = [p for p in asset_performances[-3:] if p["variation"] > 0]
    top_gainers.reverse()

    asset_performance_json = json.dumps({
        "gainers": top_gainers,
        "losers": top_losers,
        "month_variation": round(float(month_variation_total), 2),
    })

    # 4. Upsert Snapshot
    snapshot = (
        session.query(MonthlyPortfolioSnapshot)
        .filter_by(user_id=user_id, year=year, month=month)
        .first()
    )

    if not snapshot:
        snapshot = MonthlyPortfolioSnapshot(
            user_id=user_id,
            year=year,
            month=month,
        )
        session.add(snapshot)

    snapshot.total_invested_cost = total_invested_cost
    snapshot.total_market_value = total_market_value
    snapshot.realized_pnl = realized_pnl
    snapshot.unrealized_pnl = unrealized_pnl
    snapshot.asset_performance = asset_performance_json

    session.flush()
    return snapshot


def get_monthly_evolution_series(session, user_id: int):
    """
    Returns the monthly evolution series.
    Lazy loads missing months from the first transaction up to current month.
    """
    first_tx = (
        session.query(func.min(AssetTransaction.transaction_date))
        .filter(AssetTransaction.user_id == user_id)
        .scalar()
    )

    if not first_tx:
        return []

    start_date = _to_date(first_tx) or date.today()
    start_year = start_date.year
    start_month = start_date.month

    today = date.today()
    end_year = today.year
    end_month = today.month

    required_months = []
    y, m = start_year, start_month
    while y < end_year or (y == end_year and m <= end_month):
        required_months.append((y, m))
        m += 1
        if m > 12:
            m = 1
            y += 1

    existing_snapshots = (
        session.query(MonthlyPortfolioSnapshot)
        .filter(MonthlyPortfolioSnapshot.user_id == user_id)
        .all()
    )

    existing_map = {(s.year, s.month): s for s in existing_snapshots}
    missing_months = [ym for ym in required_months if ym not in existing_map]
    price_cache = build_historical_price_cache(session, user_id) if missing_months else None

    results = []
    previous_unrealized = 0.0
    for y, m in required_months:
        if (y, m) not in existing_map:
            snap = generate_or_update_monthly_snapshot(session, user_id, y, m, price_cache=price_cache)
            session.commit()
            existing_map[(y, m)] = snap

        snap = existing_map[(y, m)]
        current_unrealized = float(snap.unrealized_pnl or 0.0)
        current_realized = float(snap.realized_pnl or 0.0)
        perf_data = json.loads(snap.asset_performance) if snap.asset_performance else None

        if perf_data and perf_data.get("month_variation") is not None:
            month_variation = float(perf_data["month_variation"])
        else:
            month_variation = (current_unrealized - previous_unrealized) + current_realized

        previous_unrealized = current_unrealized

        results.append({
            "year": snap.year,
            "month": snap.month,
            "period": f"{snap.month:02d}/{snap.year}",
            "total_invested_cost": float(snap.total_invested_cost),
            "total_market_value": float(snap.total_market_value),
            "realized_pnl": float(snap.realized_pnl),
            "unrealized_pnl": current_unrealized,
            "month_variation": month_variation,
            "asset_performance": perf_data,
        })

    return results


@event.listens_for(AssetTransaction, 'after_insert')
@event.listens_for(AssetTransaction, 'after_update')
@event.listens_for(AssetTransaction, 'after_delete')
def invalidate_snapshots_on_transaction_change(mapper, connection, target):
    tx_date = target.transaction_date
    if not tx_date:
        return

    year = tx_date.year
    month = tx_date.month

    # Delete snapshots for this month and onwards
    connection.execute(
        MonthlyPortfolioSnapshot.__table__.delete().where(
            (MonthlyPortfolioSnapshot.user_id == target.user_id)
            & (
                (MonthlyPortfolioSnapshot.year > year)
                | ((MonthlyPortfolioSnapshot.year == year) & (MonthlyPortfolioSnapshot.month >= month))
            )
        )
    )
