from flask import Blueprint, jsonify, g, request
from db.session import Session
from domain.portfolio.monthly_snapshot import (
    get_monthly_evolution_series,
    generate_or_update_monthly_snapshot,
    apply_transaction_to_position_state,
    build_historical_price_cache,
)
from domain.portfolio.attribution import calculate_monthly_attribution
from domain.portfolio.xirr import calculate_portfolio_returns
from db.models import (
    DatabaseStateProxy,
    AssetTransaction,
    Asset,
    Category,
    Position,
    CorporateEvent,
    Dividend,
    FixedIncome,
    MarketData,
    PortfolioSnapshot,
    MonthlyPortfolioSnapshot,
    TaxProfile,
    SystemCache,
    safe_commit,
)
from infrastructure.price_cache import invalidate as invalidate_price_cache
from services_modules.backup import BackupService
from collections import Counter
from sqlalchemy import func
import traceback
import threading
from datetime import timedelta, date, datetime
from decimal import Decimal
import logging

portfolio_bp = Blueprint('portfolio', __name__)

@portfolio_bp.route('/api/portfolio/monthly-evolution', methods=['GET'])
def get_monthly_evolution():
    try:
        user_id = getattr(g, 'user_id', 1)
        with Session() as session:
            series = get_monthly_evolution_series(session, user_id)
            return jsonify(series), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

HISTORY_SYNC_STATE = DatabaseStateProxy("history_sync")

def _run_history_sync(user_id):
    try:
        from db.session import Session
        with Session() as session:
            first_tx = session.query(AssetTransaction).filter(AssetTransaction.user_id == user_id).order_by(AssetTransaction.transaction_date).first()
            if not first_tx:
                HISTORY_SYNC_STATE.update({"status": "idle", "progress": 1, "total": 1, "message": "Nenhuma transação encontrada."})
                return
                
            start_date = first_tx.transaction_date.date() if hasattr(first_tx.transaction_date, 'date') else first_tx.transaction_date
            end_date = date.today()
            delta_days = (end_date - start_date).days
            total_steps = delta_days + 1
            
            HISTORY_SYNC_STATE.update({"status": "processing", "progress": 0, "total": total_steps, "message": "Iniciando recálculo..."})
            
            backup_service = BackupService()
            
            # Fetch all transactions ordered by date
            from sqlalchemy import func
            from db.models import MarketData, PortfolioSnapshot, Asset, SyncState
            import calendar
            import json
            
            # Helper to update state inside the same session
            def update_state_in_session(sess, status, progress, total, message):
                state = sess.query(SyncState).filter_by(key="history_sync").first()
                if not state:
                    state = SyncState(key="history_sync")
                    sess.add(state)
                state.status = status
                state.progress = progress
                state.total = total
                state.message = message
                sess.flush()
            
            txs = session.query(AssetTransaction, Asset).join(Asset, AssetTransaction.ticker == Asset.ticker).filter(AssetTransaction.user_id == user_id).order_by(AssetTransaction.transaction_date.asc(), AssetTransaction.id.asc()).all()
            
            md_cache = build_historical_price_cache(
                session,
                user_id,
                progress_cb=lambda msg: update_state_in_session(session, 'processing', 0, 100, msg),
            )
                
            def get_price_on_date(asset_id, d):
                # Search backwards for the closest price
                curr = d
                for _ in range(30): # look back up to 30 days
                    if asset_id in md_cache and curr in md_cache[asset_id]:
                        return md_cache[asset_id][curr]
                    curr -= timedelta(days=1)
                return 0.0

            portfolio = {}
            tx_index = 0
            num_txs = len(txs)
            
            # Delete old daily and monthly snapshots for this user before full replay
            session.query(PortfolioSnapshot).filter(PortfolioSnapshot.user_id == user_id).delete()
            session.query(MonthlyPortfolioSnapshot).filter(MonthlyPortfolioSnapshot.user_id == user_id).delete()
            
            for i in range(total_steps):
                current_date = start_date + timedelta(days=i)
                
                # Apply transactions for this day
                while tx_index < num_txs:
                    tx, asset = txs[tx_index]
                    tx_d = tx.transaction_date.date() if hasattr(tx.transaction_date, 'date') else tx.transaction_date
                    if tx_d > current_date:
                        break
                        
                    if asset.id not in portfolio:
                        portfolio[asset.id] = {"quantity": 0.0, "total_cost": 0.0, "category": asset.category.name if asset.category else "Outros"}
                    
                    apply_transaction_to_position_state(portfolio[asset.id], tx, use_decimal=False)
                    
                    tx_index += 1
                    
                # Calculate daily snapshot
                total_invested = 0.0
                total_equity = 0.0
                breakdown = {}
                
                for asset_id, pos in portfolio.items():
                    if pos["quantity"] > 0:
                        total_invested += pos["total_cost"]
                        price = get_price_on_date(asset_id, current_date)
                        if price == 0.0:
                            price = pos["total_cost"] / pos["quantity"]
                        equity = pos["quantity"] * price
                        total_equity += equity
                        
                        cat = pos["category"]
                        if cat not in breakdown:
                            breakdown[cat] = 0.0
                        breakdown[cat] += equity
                        
                # Save Daily Snapshot
                if total_invested > 0 or total_equity > 0:
                    snap = PortfolioSnapshot(
                        user_id=user_id,
                        date=current_date,
                        total_invested=total_invested,
                        total_equity=total_equity,
                        profit=total_equity - total_invested,
                        breakdown=json.dumps(breakdown)
                    )
                    session.add(snap)
                    
                is_last_day = (current_date.month != (current_date + timedelta(days=1)).month)
                if is_last_day or i == total_steps - 1:
                    generate_or_update_monthly_snapshot(session, user_id, current_date.year, current_date.month, md_cache)
                
                # Update progress every 30 days to avoid spamming the DB
                if i % 30 == 0:
                    update_state_in_session(session, "processing", i, total_steps, f"Analisando dia {i} de {total_steps}...")
                    session.commit()
            
            update_state_in_session(session, "idle", total_steps, total_steps, "Histórico recalculado com sucesso!")
            session.commit()
    except Exception as e:
        HISTORY_SYNC_STATE.update({"status": "error", "message": f"Erro: {str(e)}"})
        logging.error(f"Fatal error in history sync thread: {e}", exc_info=True)

@portfolio_bp.route('/api/portfolio/recalculate-history', methods=['POST'])
def recalculate_history():
    user_id = getattr(g, 'user_id', 1)
    
    # Check if already running
    status = HISTORY_SYNC_STATE.get("status")
    if status == "processing":
        return jsonify({"message": "Já existe uma sincronização em andamento."}), 400
        
    HISTORY_SYNC_STATE.update({"status": "processing", "progress": 0, "total": 100, "message": "Iniciando recálculo..."})
    
    thread = threading.Thread(target=_run_history_sync, args=(user_id,))
    thread.start()
    
    return jsonify({"message": "Recálculo iniciado com sucesso"}), 202

@portfolio_bp.route('/api/portfolio/history-sync-status', methods=['GET'])
def get_history_sync_status():
    return jsonify(HISTORY_SYNC_STATE.get_all())


@portfolio_bp.route('/api/performance/attribution', methods=['GET'])
def get_performance_attribution():
    try:
        user_id = getattr(g, 'user_id', 1)
        with Session() as session:
            result = calculate_monthly_attribution(session, user_id)
            return jsonify(result), 200
    except Exception as e:
        logging.error(f"❌ Erro ao calcular atribuição patrimonial: {e}", exc_info=True)
        return jsonify({"status": "Erro", "msg": str(e)}), 500


@portfolio_bp.route('/api/performance/returns', methods=['GET'])
def get_performance_returns():
    try:
        user_id = getattr(g, 'user_id', 1)
        with Session() as session:
            result = calculate_portfolio_returns(session, user_id)
            return jsonify(result), 200
    except Exception as e:
        logging.error(f"❌ Erro ao calcular XIRR / TWR: {e}", exc_info=True)
        return jsonify({"status": "Erro", "msg": str(e)}), 500


def _iso_or_none(val):
    """Serialize date/datetime values to ISO-8601 strings."""
    if val is None:
        return None
    if hasattr(val, 'isoformat'):
        return val.isoformat()
    return str(val)


def _opt_float(val, default=None):
    """Convert Numeric/Decimal values safely to float."""
    if val is None:
        return default
    return float(val)


def _parse_date(val):
    """Parse date/datetime or ISO string into a datetime.date object."""
    if val is None or val == "":
        return None
    if isinstance(val, datetime):
        return val.date()
    if isinstance(val, date):
        return val
    s = str(val).strip()
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).date()
    except ValueError:
        return date.fromisoformat(s[:10])


def _parse_dt(val):
    """Parse datetime/date or ISO string into a datetime.datetime object."""
    if val is None or val == "":
        return None
    if isinstance(val, datetime):
        return val
    if isinstance(val, date):
        return datetime(val.year, val.month, val.day)
    s = str(val).strip()
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        d = date.fromisoformat(s[:10])
        return datetime(d.year, d.month, d.day)


def _get_or_create_asset_for_import(session, item, cat_cache, ticker_cache):
    """Resolve or create Category, Asset, and seed MarketData when absent."""
    raw_ticker = str(item.get("ticker") or "").strip()
    if not raw_ticker:
        return None

    cat_name = str(item.get("category") or "Ação").strip() or "Ação"
    ticker = raw_ticker if (cat_name in ("Reserva", "Renda Fixa") or " " in raw_ticker) else raw_ticker.upper()
    ticker_key = ticker.upper()

    category = cat_cache.get(cat_name)
    if category is None:
        category = session.query(Category).filter(Category.name == cat_name).first()
        if category is None:
            category = Category(name=cat_name, target_percent=Decimal("0"))
            session.add(category)
            session.flush()
        cat_cache[cat_name] = category

    asset = ticker_cache.get(ticker_key)
    if asset is None:
        asset = session.query(Asset).filter(func.upper(Asset.ticker) == ticker_key).first()
        if asset is None:
            asset = Asset(
                ticker=ticker,
                name=item.get("name") or ticker,
                cnpj=item.get("cnpj"),
                cvm_code=item.get("cvm_code"),
                currency=item.get("currency") or "BRL",
                category_id=category.id,
            )
            session.add(asset)
            session.flush()
        elif item.get("category") and asset.category_id != category.id:
            asset.category_id = category.id
        ticker_cache[ticker_key] = asset

    current_price = item.get("current_price")
    if current_price is not None and float(current_price) > 0:
        has_md = session.query(MarketData.id).filter(MarketData.asset_id == asset.id).first()
        if not has_md:
            session.add(MarketData(
                asset_id=asset.id,
                date=date.today(),
                price=Decimal(str(current_price)),
            ))

    return asset


def _invalidate_user_caches(session, user_id):
    """Clear in-memory price caches and persisted quant caches for a user."""
    invalidate_price_cache()
    try:
        keys = [
            "risk_metrics",
            "risk_metrics_cache",
            "correlation_matrix_cache",
            "efficient_frontier",
            "optimize_portfolio",
            "risk_parity",
            "morning_brief",
        ]
        keys_to_del = keys + [f"{k}_{user_id}" for k in keys]
        session.query(SystemCache).filter(SystemCache.key.in_(keys_to_del)).delete(synchronize_session=False)
    except Exception as exc:
        logging.warning(f"Falha ao limpar cache quant do usuario {user_id}: {exc}")


def serialize_history_payload(session, user_id):
    """Serialize all treated portfolio data for a user into a portable backup payload."""
    pos_rows = (
        session.query(Position, Asset, Category)
        .join(Asset, Position.asset_id == Asset.id)
        .join(Category, Asset.category_id == Category.id)
        .filter(Position.user_id == user_id)
        .order_by(Asset.ticker.asc())
        .all()
    )

    asset_ids = [asset.id for _, asset, _ in pos_rows]
    latest_prices = {}
    if asset_ids:
        md_rows = (
            session.query(MarketData)
            .filter(MarketData.asset_id.in_(asset_ids))
            .order_by(MarketData.asset_id.asc(), MarketData.date.desc(), MarketData.id.desc())
            .all()
        )
        for md in md_rows:
            if md.asset_id not in latest_prices and md.price is not None:
                latest_prices[md.asset_id] = float(md.price)

    positions_data = [
        {
            "ticker": asset.ticker,
            "name": asset.name,
            "category": cat.name,
            "currency": asset.currency or "BRL",
            "cnpj": asset.cnpj,
            "cvm_code": asset.cvm_code,
            "quantity": _opt_float(pos.quantity, 0.0),
            "average_price": _opt_float(pos.average_price, 0.0),
            "target_percent": _opt_float(pos.target_percent, 0.0),
            "manual_lpa": _opt_float(pos.manual_lpa),
            "manual_vpa": _opt_float(pos.manual_vpa),
            "manual_dy": _opt_float(pos.manual_dy),
            "current_price": latest_prices.get(asset.id),
        }
        for pos, asset, cat in pos_rows
    ]

    corp_rows = (
        session.query(CorporateEvent, Asset, Category)
        .join(Asset, CorporateEvent.asset_id == Asset.id)
        .join(Category, Asset.category_id == Category.id)
        .filter(CorporateEvent.user_id == user_id)
        .order_by(CorporateEvent.date.asc(), CorporateEvent.id.asc())
        .all()
    )
    corp_id_to_idx = {}
    corporate_events_data = []
    for idx, (ce, asset, cat) in enumerate(corp_rows):
        corp_id_to_idx[ce.id] = idx
        corporate_events_data.append({
            "export_idx": idx,
            "ticker": asset.ticker,
            "name": asset.name,
            "category": cat.name,
            "type": ce.type,
            "factor": _opt_float(ce.factor),
            "percent": _opt_float(ce.percent),
            "unit_cost": _opt_float(ce.unit_cost),
            "new_ticker": ce.new_ticker,
            "received_qty": _opt_float(ce.received_qty),
            "date": _iso_or_none(ce.date),
            "source": ce.source or "manual",
            "cost_percent": _opt_float(ce.cost_percent),
            "raw_data": ce.raw_data,
        })

    tx_rows = (
        session.query(AssetTransaction)
        .filter(AssetTransaction.user_id == user_id)
        .order_by(AssetTransaction.transaction_date.asc(), AssetTransaction.id.asc())
        .all()
    )
    transactions_data = [
        {
            "ticker": tx.ticker,
            "type": tx.type,
            "quantity": _opt_float(tx.quantity, 0.0),
            "unit_price": _opt_float(tx.unit_price, 0.0),
            "total_value": _opt_float(tx.total_value, 0.0),
            "cost_basis": _opt_float(tx.cost_basis),
            "is_day_trade": bool(tx.is_day_trade),
            "transaction_date": _iso_or_none(tx.transaction_date),
            "is_option": bool(tx.is_option),
            "option_meta": tx.option_meta,
            "corporate_event_idx": corp_id_to_idx.get(tx.corporate_event_id),
        }
        for tx in tx_rows
    ]

    div_rows = (
        session.query(Dividend, Asset, Category)
        .join(Asset, Dividend.asset_id == Asset.id)
        .join(Category, Asset.category_id == Category.id)
        .filter(Dividend.user_id == user_id)
        .order_by(Dividend.date_payment.asc(), Dividend.date_com.asc(), Dividend.id.asc())
        .all()
    )
    dividends_data = [
        {
            "ticker": asset.ticker,
            "category": cat.name,
            "date_com": _iso_or_none(div.date_com),
            "date_payment": _iso_or_none(div.date_payment),
            "type": div.type or "Dividendo",
            "value_per_share": _opt_float(div.value_per_share, 0.0),
            "quantity_at_date": _opt_float(div.quantity_at_date, 0.0),
            "total_value": _opt_float(div.total_value, 0.0),
            "status": div.status or "PAGO",
        }
        for div, asset, cat in div_rows
    ]

    fi_rows = (
        session.query(FixedIncome, Asset, Category)
        .join(Asset, FixedIncome.asset_id == Asset.id)
        .join(Category, Asset.category_id == Category.id)
        .filter(
            FixedIncome.user_id == user_id,
            (FixedIncome.is_deleted == False) | (FixedIncome.is_deleted.is_(None)),
        )
        .order_by(FixedIncome.id.asc())
        .all()
    )
    fixed_income_data = [
        {
            "ticker": asset.ticker,
            "name": asset.name,
            "category": cat.name,
            "index_type": fi.index_type,
            "interest_rate": _opt_float(fi.interest_rate, 0.0),
            "issue_date": _iso_or_none(fi.issue_date),
            "due_date": _iso_or_none(fi.due_date),
        }
        for fi, asset, cat in fi_rows
    ]

    tax_profile = session.query(TaxProfile).filter(TaxProfile.user_id == user_id).first()
    tax_profile_data = (
        {
            "accumulated_loss_stocks_st": _opt_float(tax_profile.accumulated_loss_stocks_st, 0.0),
            "accumulated_loss_stocks_dt": _opt_float(tax_profile.accumulated_loss_stocks_dt, 0.0),
            "accumulated_loss_fiis": _opt_float(tax_profile.accumulated_loss_fiis, 0.0),
            "accumulated_darf_balance": _opt_float(tax_profile.accumulated_darf_balance, 0.0),
        }
        if tax_profile
        else None
    )

    ms_rows = (
        session.query(MonthlyPortfolioSnapshot)
        .filter(MonthlyPortfolioSnapshot.user_id == user_id)
        .order_by(MonthlyPortfolioSnapshot.year.asc(), MonthlyPortfolioSnapshot.month.asc())
        .all()
    )
    monthly_snapshots_data = [
        {
            "year": ms.year,
            "month": ms.month,
            "total_invested_cost": _opt_float(ms.total_invested_cost, 0.0),
            "total_market_value": _opt_float(ms.total_market_value, 0.0),
            "realized_pnl": _opt_float(ms.realized_pnl, 0.0),
            "unrealized_pnl": _opt_float(ms.unrealized_pnl, 0.0),
            "asset_performance": ms.asset_performance,
        }
        for ms in ms_rows
    ]

    return {
        "schema_version": "1.0",
        "exported_at": datetime.now().isoformat(),
        "positions": positions_data,
        "corporate_events": corporate_events_data,
        "transactions": transactions_data,
        "dividends": dividends_data,
        "fixed_income": fixed_income_data,
        "tax_profile": tax_profile_data,
        "monthly_snapshots": monthly_snapshots_data,
    }


def _restore_history_payload(session, user_id, payload, mode="replace"):
    """Restore a treated history backup payload into DB rows scoped to user_id."""
    if mode == "replace":
        session.query(AssetTransaction).filter(AssetTransaction.user_id == user_id).delete(synchronize_session=False)
        session.query(CorporateEvent).filter(CorporateEvent.user_id == user_id).delete(synchronize_session=False)
        session.query(Dividend).filter(Dividend.user_id == user_id).delete(synchronize_session=False)
        session.query(FixedIncome).filter(FixedIncome.user_id == user_id).delete(synchronize_session=False)
        session.query(Position).filter(Position.user_id == user_id).delete(synchronize_session=False)
        session.query(PortfolioSnapshot).filter(PortfolioSnapshot.user_id == user_id).delete(synchronize_session=False)
        session.query(MonthlyPortfolioSnapshot).filter(MonthlyPortfolioSnapshot.user_id == user_id).delete(synchronize_session=False)
        session.query(TaxProfile).filter(TaxProfile.user_id == user_id).delete(synchronize_session=False)
        session.flush()

    cat_cache = {}
    ticker_cache = {}
    pos_by_asset = {
        pos.asset_id: pos
        for pos in session.query(Position).filter(Position.user_id == user_id).all()
    }

    counts = {
        "positions": 0,
        "corporate_events": 0,
        "transactions": 0,
        "dividends": 0,
        "fixed_income": 0,
        "monthly_snapshots": 0,
    }

    positions_list = payload.get("positions") or []
    pos_meta_by_ticker = {}
    for item in positions_list:
        asset = _get_or_create_asset_for_import(session, item, cat_cache, ticker_cache)
        if asset is None:
            continue
        pos_meta_by_ticker[asset.ticker] = item
        pos = pos_by_asset.get(asset.id)
        if pos is None:
            pos = Position(asset_id=asset.id, user_id=user_id)
            session.add(pos)
            pos_by_asset[asset.id] = pos
        pos.quantity = Decimal(str(item.get("quantity", 0) or 0))
        pos.average_price = Decimal(str(item.get("average_price", 0) or 0))
        pos.target_percent = Decimal(str(item.get("target_percent", 0) or 0))
        pos.manual_lpa = Decimal(str(item["manual_lpa"])) if item.get("manual_lpa") is not None else None
        pos.manual_vpa = Decimal(str(item["manual_vpa"])) if item.get("manual_vpa") is not None else None
        pos.manual_dy = Decimal(str(item["manual_dy"])) if item.get("manual_dy") is not None else None
        counts["positions"] += 1
    session.flush()

    def _ensure_position(item):
        asset = _get_or_create_asset_for_import(session, item, cat_cache, ticker_cache)
        if asset is None:
            return None, None
        pos = pos_by_asset.get(asset.id)
        if pos is None:
            meta = pos_meta_by_ticker.get(asset.ticker, {})
            pos = Position(
                asset_id=asset.id,
                user_id=user_id,
                quantity=Decimal(str(meta.get("quantity", 0) or 0)),
                average_price=Decimal(str(meta.get("average_price", 0) or 0)),
                target_percent=Decimal("0"),
            )
            session.add(pos)
            session.flush()
            pos_by_asset[asset.id] = pos
        return asset, pos

    existing_corps = {}
    existing_tx_counts = Counter()
    existing_divs = set()
    existing_fis = set()
    existing_ms = set()
    if mode == "merge":
        for ce in session.query(CorporateEvent).filter(CorporateEvent.user_id == user_id).all():
            ckey = (ce.asset_id, ce.type, _iso_or_none(ce.date), round(float(ce.factor or 0), 4), ce.new_ticker or "")
            existing_corps[ckey] = ce.id
        for tx in session.query(AssetTransaction).filter(AssetTransaction.user_id == user_id).all():
            tkey = (tx.ticker, tx.type, _iso_or_none(tx.transaction_date), round(float(tx.quantity or 0), 6), round(float(tx.total_value or 0), 2))
            existing_tx_counts[tkey] += 1
        for div in session.query(Dividend).filter(Dividend.user_id == user_id).all():
            dkey = (div.asset_id, _iso_or_none(div.date_payment), div.type or "Dividendo", round(float(div.total_value or 0), 4))
            existing_divs.add(dkey)
        for fi in session.query(FixedIncome).filter(FixedIncome.user_id == user_id).all():
            fkey = (fi.asset_id, fi.index_type, _iso_or_none(fi.issue_date), _iso_or_none(fi.due_date))
            existing_fis.add(fkey)
        for ms in session.query(MonthlyPortfolioSnapshot).filter(MonthlyPortfolioSnapshot.user_id == user_id).all():
            existing_ms.add((ms.year, ms.month))

    corp_idx_to_id = {}
    for idx, item in enumerate(payload.get("corporate_events") or []):
        asset = _get_or_create_asset_for_import(session, item, cat_cache, ticker_cache)
        if asset is None:
            continue
        ev_date = _parse_date(item.get("date")) or date.today()
        export_idx = item.get("export_idx", idx)
        ckey = (asset.id, item.get("type"), ev_date.isoformat(), round(float(item.get("factor") or 0), 4), item.get("new_ticker") or "")
        if mode == "merge" and ckey in existing_corps:
            corp_idx_to_id[export_idx] = existing_corps[ckey]
            continue
        ce = CorporateEvent(
            asset_id=asset.id,
            user_id=user_id,
            type=item.get("type") or "SPLIT",
            factor=Decimal(str(item["factor"])) if item.get("factor") is not None else None,
            percent=Decimal(str(item["percent"])) if item.get("percent") is not None else None,
            unit_cost=Decimal(str(item["unit_cost"])) if item.get("unit_cost") is not None else None,
            new_ticker=item.get("new_ticker"),
            received_qty=Decimal(str(item["received_qty"])) if item.get("received_qty") is not None else None,
            date=ev_date,
            source=item.get("source") or "backup_restore",
            cost_percent=Decimal(str(item["cost_percent"])) if item.get("cost_percent") is not None else None,
            raw_data=item.get("raw_data"),
        )
        session.add(ce)
        session.flush()
        corp_idx_to_id[export_idx] = ce.id
        existing_corps[ckey] = ce.id
        counts["corporate_events"] += 1

    for item in payload.get("transactions") or []:
        asset, pos = _ensure_position(item)
        if asset is None or pos is None:
            continue
        tx_dt = _parse_dt(item.get("transaction_date")) or datetime.now()
        qty_val = float(item.get("quantity", 0) or 0)
        tot_val = float(item.get("total_value", 0) or 0)
        tkey = (asset.ticker, item.get("type"), _iso_or_none(tx_dt), round(qty_val, 6), round(tot_val, 2))
        if mode == "merge" and existing_tx_counts.get(tkey, 0) > 0:
            existing_tx_counts[tkey] -= 1
            continue
        ce_idx = item.get("corporate_event_idx")
        tx = AssetTransaction(
            position_id=pos.id,
            user_id=user_id,
            ticker=asset.ticker,
            type=item.get("type") or "BUY",
            quantity=Decimal(str(qty_val)),
            unit_price=Decimal(str(item.get("unit_price", 0) or 0)),
            total_value=Decimal(str(tot_val)),
            cost_basis=Decimal(str(item["cost_basis"])) if item.get("cost_basis") is not None else None,
            is_day_trade=bool(item.get("is_day_trade", False)),
            transaction_date=tx_dt,
            is_option=bool(item.get("is_option", False)),
            option_meta=item.get("option_meta"),
            corporate_event_id=corp_idx_to_id.get(ce_idx) if ce_idx is not None else None,
        )
        session.add(tx)
        counts["transactions"] += 1

    for item in payload.get("dividends") or []:
        asset = _get_or_create_asset_for_import(session, item, cat_cache, ticker_cache)
        if asset is None:
            continue
        d_pay = _parse_date(item.get("date_payment"))
        d_com = _parse_date(item.get("date_com")) or d_pay or date.today()
        d_type = item.get("type") or "Dividendo"
        tot_val = float(item.get("total_value", 0) or 0)
        dkey = (asset.id, _iso_or_none(d_pay), d_type, round(tot_val, 4))
        if dkey in existing_divs:
            continue
        existing_divs.add(dkey)
        session.add(Dividend(
            asset_id=asset.id,
            user_id=user_id,
            date_com=d_com,
            date_payment=d_pay,
            type=d_type,
            value_per_share=Decimal(str(item.get("value_per_share", 0) or 0)),
            quantity_at_date=Decimal(str(item.get("quantity_at_date", 0) or 0)),
            total_value=Decimal(str(tot_val)),
            status=item.get("status") or "PAGO",
        ))
        counts["dividends"] += 1

    for item in payload.get("fixed_income") or []:
        asset, _ = _ensure_position(item)
        if asset is None:
            continue
        issue_dt = _parse_dt(item.get("issue_date")) or datetime.now()
        due_dt = _parse_dt(item.get("due_date")) or issue_dt
        idx_type = item.get("index_type") or "CDI"
        fkey = (asset.id, idx_type, _iso_or_none(issue_dt), _iso_or_none(due_dt))
        if mode == "merge" and fkey in existing_fis:
            continue
        existing_fis.add(fkey)
        session.add(FixedIncome(
            asset_id=asset.id,
            user_id=user_id,
            index_type=idx_type,
            interest_rate=Decimal(str(item.get("interest_rate", 0) or 0)),
            issue_date=issue_dt,
            due_date=due_dt,
            is_deleted=False,
        ))
        counts["fixed_income"] += 1

    tp_data = payload.get("tax_profile")
    if isinstance(tp_data, dict):
        tp = session.query(TaxProfile).filter(TaxProfile.user_id == user_id).first()
        if tp is None:
            tp = TaxProfile(user_id=user_id)
            session.add(tp)
        tp.accumulated_loss_stocks_st = Decimal(str(tp_data.get("accumulated_loss_stocks_st", 0) or 0))
        tp.accumulated_loss_stocks_dt = Decimal(str(tp_data.get("accumulated_loss_stocks_dt", 0) or 0))
        tp.accumulated_loss_fiis = Decimal(str(tp_data.get("accumulated_loss_fiis", 0) or 0))
        tp.accumulated_darf_balance = Decimal(str(tp_data.get("accumulated_darf_balance", 0) or 0))

    for item in payload.get("monthly_snapshots") or []:
        yr = item.get("year")
        mo = item.get("month")
        if not isinstance(yr, int) or not isinstance(mo, int):
            continue
        if (yr, mo) in existing_ms:
            continue
        existing_ms.add((yr, mo))
        session.add(MonthlyPortfolioSnapshot(
            user_id=user_id,
            year=yr,
            month=mo,
            total_invested_cost=Decimal(str(item.get("total_invested_cost", 0) or 0)),
            total_market_value=Decimal(str(item.get("total_market_value", 0) or 0)),
            realized_pnl=Decimal(str(item.get("realized_pnl", 0) or 0)),
            unrealized_pnl=Decimal(str(item.get("unrealized_pnl", 0) or 0)),
            asset_performance=item.get("asset_performance"),
        ))
        counts["monthly_snapshots"] += 1

    return counts


@portfolio_bp.route('/api/portfolio/export-history', methods=['GET'])
def export_treated_history():
    try:
        user_id = getattr(g, 'user_id', 1)
        with Session() as session:
            payload = serialize_history_payload(session, user_id)
            return jsonify(payload), 200
    except Exception as e:
        logging.error(f"❌ Erro ao exportar histórico tratado: {e}", exc_info=True)
        return jsonify({"status": "Erro", "msg": str(e)}), 500


@portfolio_bp.route('/api/portfolio/import-history', methods=['POST'])
def import_treated_history():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict) or not payload.get("schema_version"):
        return jsonify({"status": "Erro", "msg": "Payload inválido: schema_version obrigatório."}), 400
    if not isinstance(payload.get("positions"), list) or not isinstance(payload.get("transactions"), list):
        return jsonify({"status": "Erro", "msg": "Payload inválido: positions e transactions devem ser listas."}), 400

    for opt_list in ("corporate_events", "dividends", "fixed_income", "monthly_snapshots"):
        if payload.get(opt_list) is not None and not isinstance(payload.get(opt_list), list):
            return jsonify({"status": "Erro", "msg": f"Campo inválido: {opt_list} deve ser uma lista."}), 400

    mode = payload.get("mode", "replace")
    if mode not in ("replace", "merge"):
        return jsonify({"status": "Erro", "msg": "Modo inválido: use 'replace' ou 'merge'."}), 400

    try:
        user_id = getattr(g, 'user_id', 1)
        with Session() as session:
            counts = _restore_history_payload(session, user_id, payload, mode=mode)
            safe_commit(session)
            _invalidate_user_caches(session, user_id)
            safe_commit(session)
            return jsonify({"status": "Sucesso", "mode": mode, "imported": counts}), 200
    except Exception as e:
        logging.error(f"❌ Erro ao importar histórico tratado: {e}", exc_info=True)
        return jsonify({"status": "Erro", "msg": str(e)}), 500
