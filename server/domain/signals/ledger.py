"""
server/domain/signals/ledger.py
Sincronização persistente de série diária Total Return, captura de sinais em produção (`signal_ledger`),
auditoria viva pós-horizonte (`signal_outcomes`) e cálculo histórico multi-horizonte real.
"""
from __future__ import annotations

import logging
from bisect import bisect_left
from datetime import date, datetime, timedelta
from typing import Optional

import numpy as np
import pandas as pd

from domain.signals.regime import detect_and_persist_market_regime, get_latest_market_regime
from domain.signals.walk_forward import (
    ASSET_CLASS_BENCHMARK,
    ASSET_CLASS_COST_BPS,
    SETUPS_BY_CLASS,
    _compute_wilder_rsi,
    _evaluate_setup_trigger,
    infer_signal_asset_class,
)
from domain.signals.wilson import classify_confidence_tier


def sync_price_history_from_yf(
    session,
    tickers_with_cat: list[tuple[str, str]],
    period: str = "2y",
) -> int:
    """Baixa OHLCV + Adj Close e persiste `PriceHistoryDaily` (nominal + Total Return + RSI/SMAs)."""
    import yfinance as yf
    from db.models.signals import PriceHistoryDaily
    from utils.http_client import get_secure_session
    from utils.ticker_helper import to_yf_ticker

    symbol_map: dict[str, list[str]] = {}
    for raw_tkr, cat in tickers_with_cat:
        t_u = (raw_tkr or "").strip().upper()
        if not t_u:
            continue
        if t_u.startswith("^") or t_u.endswith(".SA") or "-" in t_u:
            sym = t_u
        else:
            sym = to_yf_ticker(t_u, cat)
        symbol_map.setdefault(sym, []).append(t_u)

    for bench in ("^BVSP", "^GSPC", "IFIX.SA"):
        symbol_map.setdefault(bench, [bench])

    dl_list = sorted(symbol_map.keys())
    if not dl_list:
        return 0

    secure_session = get_secure_session(timeout=12.0)
    raw = yf.download(
        dl_list,
        period=period,
        group_by="ticker",
        threads=False,
        progress=False,
        auto_adjust=False,
        actions=False,
        session=secure_session,
    )
    if raw is None or raw.empty:
        return 0

    upserted = 0
    for sym, local_tickers in symbol_map.items():
        try:
            if isinstance(raw.columns, pd.MultiIndex):
                if sym not in raw.columns.levels[0]:
                    continue
                hist = raw[sym]
            else:
                hist = raw if len(dl_list) == 1 else pd.DataFrame()

            if hist is None or hist.empty or "Close" not in hist.columns:
                continue

            hist = hist.dropna(subset=["Close"]).copy()
            if hist.empty:
                continue

            adj_col = hist["Adj Close"].fillna(hist["Close"]) if "Adj Close" in hist.columns else hist["Close"]
            rsi_s = _compute_wilder_rsi(adj_col.astype(float), 14)
            sma20_s = adj_col.rolling(20, min_periods=1).mean()
            sma50_s = adj_col.rolling(50, min_periods=1).mean()
            sma200_s = adj_col.rolling(200, min_periods=1).mean()
            ewma_vol_s = np.log(adj_col / adj_col.shift(1)).ewm(span=21).std() * np.sqrt(252.0)

            for local_tkr in set(local_tickers):
                existing_by_dt = {
                    r.date: r
                    for r in session.query(PriceHistoryDaily).filter_by(ticker=local_tkr).all()
                }
                for dt_idx, row in hist.iterrows():
                    d_val = dt_idx.date() if hasattr(dt_idx, "date") else dt_idx
                    close_raw = float(row["Close"])
                    adj_val = float(adj_col.loc[dt_idx])
                    if close_raw <= 0 or adj_val <= 0:
                        continue

                    rec = existing_by_dt.get(d_val)
                    if rec is None:
                        rec = PriceHistoryDaily(ticker=local_tkr, date=d_val)
                        session.add(rec)
                        existing_by_dt[d_val] = rec

                    rec.open_raw = float(row["Open"]) if "Open" in row and pd.notna(row["Open"]) else close_raw
                    rec.high_raw = float(row["High"]) if "High" in row and pd.notna(row["High"]) else close_raw
                    rec.low_raw = float(row["Low"]) if "Low" in row and pd.notna(row["Low"]) else close_raw
                    rec.close_raw = close_raw
                    rec.adj_close_tr = adj_val
                    rec.volume = float(row["Volume"]) if "Volume" in row and pd.notna(row["Volume"]) else None
                    rec.rsi_14 = round(float(rsi_s.loc[dt_idx]), 2) if pd.notna(rsi_s.loc[dt_idx]) else 50.0
                    rec.sma_20 = float(sma20_s.loc[dt_idx]) if pd.notna(sma20_s.loc[dt_idx]) else adj_val
                    rec.sma_50 = float(sma50_s.loc[dt_idx]) if pd.notna(sma50_s.loc[dt_idx]) else adj_val
                    rec.sma_200 = float(sma200_s.loc[dt_idx]) if pd.notna(sma200_s.loc[dt_idx]) else adj_val
                    vol_val = ewma_vol_s.loc[dt_idx]
                    rec.ewma_vol_21d = round(float(vol_val), 4) if pd.notna(vol_val) else 0.18
                    upserted += 1
        except Exception as exc:
            logging.warning(f"⚠️ Falha ao sincronizar histórico diário {sym}: {exc}")

    try:
        session.commit()
    except Exception as exc:
        session.rollback()
        logging.error(f"❌ Erro ao persistir PriceHistoryDaily: {exc}")
    return upserted


def capture_daily_signals_to_ledger(
    session,
    user_id: Optional[int] = None,
    horizon_days: int = 90,
) -> list[dict]:
    """Avalia carteira com base em `PriceHistoryDaily` + `SignalSetupStat` e grava `SignalLedger` sem viés."""
    from db.models import Asset, Category, MarketScreenerItem, Position, User
    from db.models.signals import FundamentalSnapshot, PriceHistoryDaily, SignalLedger, SignalSetupStat

    regime = detect_and_persist_market_regime(session)
    regime_code = regime.composite_regime if regime else "SIDEWAYS_STABLE_NORMAL_VOL"
    today = date.today()

    stats_by_key = {
        (s.setup_code, s.asset_class, s.horizon_days): s
        for s in session.query(SignalSetupStat)
        .filter_by(regime_bucket="GLOBAL", horizon_days=horizon_days)
        .all()
    }

    user_ids = [user_id] if user_id is not None else [u.id for u in session.query(User).all()]
    if not user_ids:
        user_ids = [1]

    captured: list[dict] = []
    for uid in user_ids:
        positions = (
            session.query(Position, Asset, Category)
            .join(Asset, Position.asset_id == Asset.id)
            .outerjoin(Category, Asset.category_id == Category.id)
            .filter(Position.user_id == uid, Position.quantity > 0)
            .all()
        )
        for pos, asset, cat in positions:
            cat_name = cat.name if cat else ""
            if cat_name in ("Reserva", "Renda Fixa", "Cripto"):
                continue
            tkr = asset.ticker.strip().upper()
            latest_px = (
                session.query(PriceHistoryDaily)
                .filter_by(ticker=tkr)
                .order_by(PriceHistoryDaily.date.desc())
                .first()
            )
            if not latest_px or not latest_px.adj_close_tr:
                continue

            asset_class = infer_signal_asset_class(cat_name, tkr)
            bench_tkr = ASSET_CLASS_BENCHMARK[asset_class]
            bench_row = (
                session.query(PriceHistoryDaily)
                .filter_by(ticker=bench_tkr)
                .order_by(PriceHistoryDaily.date.desc())
                .first()
            )
            bench_entry = float(bench_row.adj_close_tr) if (bench_row and bench_row.adj_close_tr) else 100.0

            pit_fund = (
                session.query(FundamentalSnapshot)
                .filter(FundamentalSnapshot.ticker == tkr, FundamentalSnapshot.filing_date <= today)
                .order_by(FundamentalSnapshot.filing_date.desc())
                .first()
            )
            if pit_fund is None:
                scr = session.query(MarketScreenerItem).filter_by(ticker=tkr).first()
                if scr is not None:
                    pit_fund = scr

            for setup_code in SETUPS_BY_CLASS.get(asset_class, ()):
                fired, triggers = _evaluate_setup_trigger(
                    setup_code,
                    float(latest_px.adj_close_tr),
                    float(latest_px.rsi_14 or 50.0),
                    float(latest_px.sma_20 or latest_px.adj_close_tr),
                    float(latest_px.sma_50 or latest_px.adj_close_tr),
                    float(latest_px.sma_200 or latest_px.adj_close_tr),
                    pit_fund,
                )
                if not fired:
                    continue

                stat = stats_by_key.get((setup_code, asset_class, horizon_days))
                n_samp = int(stat.sample_size_n) if stat else 0
                oos_n = int(stat.oos_sample_n) if stat else 0
                wlb_90 = float(stat.wilson_lb_90) if stat else 0.0
                wlb_95 = float(stat.wilson_lb_95) if stat else 0.0
                cal_prob = float(stat.calibrated_prob) if stat else 0.50
                exp_net = float(stat.expectancy_net) if stat else 0.0
                pf = stat.profit_factor if stat else 0.0
                oos_cons = float(stat.oos_consistency_score) if stat else 0.0

                tier = classify_confidence_tier(n_samp, oos_n, wlb_90, wlb_95, exp_net, pf, oos_cons)
                status = "COMPRA_FORTE" if tier == "ALTA_CERTEZA" else ("COMPRAR" if tier == "MODERADA" else "EM_OBSERVACAO")
                score_val = round(cal_prob * 100.0, 1)

                exists = (
                    session.query(SignalLedger)
                    .filter_by(user_id=uid, ticker=tkr, setup_code=setup_code, emitted_date=today)
                    .first()
                )
                if exists:
                    continue

                entry = SignalLedger(
                    user_id=uid,
                    asset_id=asset.id,
                    ticker=tkr,
                    asset_class=asset_class,
                    setup_code=setup_code,
                    setup_version="v2.0",
                    emitted_date=today,
                    status=status,
                    score=score_val,
                    calibrated_prob=cal_prob,
                    wilson_lb_95=wlb_95,
                    sample_size_n=n_samp,
                    regime_code=regime_code,
                    entry_price_raw=float(latest_px.close_raw),
                    entry_adj_tr=float(latest_px.adj_close_tr),
                    benchmark_ticker=bench_tkr,
                    benchmark_entry=bench_entry,
                    triggers_json=triggers,
                )
                session.add(entry)
                captured.append({"user_id": uid, "ticker": tkr, "setup_code": setup_code, "tier": tier})

    try:
        session.commit()
    except Exception as exc:
        session.rollback()
        logging.error(f"❌ Erro ao capturar SignalLedger: {exc}", exc_info=True)
    return captured


def audit_matured_signal_outcomes(session, horizons: tuple[int, ...] = (30, 90, 180, 365)) -> int:
    """Audita entradas maduras do SignalLedger contra `PriceHistoryDaily` gravando `SignalOutcome` e Brier Score."""
    from db.models.signals import PriceHistoryDaily, SignalLedger, SignalOutcome

    today = date.today()
    ledgers = session.query(SignalLedger).all()
    if not ledgers:
        return 0

    existing_keys = {
        (o.ledger_id, o.horizon_days)
        for o in session.query(SignalOutcome.ledger_id, SignalOutcome.horizon_days).all()
    }
    tickers_needed = {l.ticker for l in ledgers} | {l.benchmark_ticker for l in ledgers}
    ph_by_tkr: dict[str, tuple[list[date], list[PriceHistoryDaily]]] = {}
    for row in (
        session.query(PriceHistoryDaily)
        .filter(PriceHistoryDaily.ticker.in_(tickers_needed))
        .order_by(PriceHistoryDaily.ticker.asc(), PriceHistoryDaily.date.asc())
        .all()
    ):
        d_list, r_list = ph_by_tkr.setdefault(row.ticker, ([], []))
        d_list.append(row.date)
        r_list.append(row)

    audited_count = 0
    now_dt = datetime.now()

    for l in ledgers:
        if l.ticker not in ph_by_tkr:
            continue
        t_dates, t_rows = ph_by_tkr[l.ticker]
        b_dates, b_rows = ph_by_tkr.get(l.benchmark_ticker, ([], []))
        cost_pct = ASSET_CLASS_COST_BPS.get(l.asset_class, 25.0) / 100.0
        entry_tr = float(l.entry_adj_tr or 0.0)
        if entry_tr <= 0:
            continue

        for h in horizons:
            if (l.id, h) in existing_keys:
                continue
            target_dt = l.emitted_date + timedelta(days=h)
            if target_dt > today:
                continue
            idx_exit = bisect_left(t_dates, target_dt)
            if idx_exit >= len(t_rows):
                continue

            exit_row = t_rows[idx_exit]
            exit_tr = float(exit_row.adj_close_tr)
            gross_pct = ((exit_tr / entry_tr) - 1.0) * 100.0
            net_pct = gross_pct - cost_pct

            idx_start = bisect_left(t_dates, l.emitted_date)
            win_slice = [float(r.adj_close_tr) for r in t_rows[idx_start : idx_exit + 1]]
            mae_pct = (((min(win_slice) / entry_tr) - 1.0) * 100.0) if win_slice else 0.0

            bench_ret_pct = 0.0
            if b_dates and float(l.benchmark_entry or 0) > 0:
                b_idx = bisect_left(b_dates, target_dt)
                if b_idx < len(b_rows):
                    bench_ret_pct = ((float(b_rows[b_idx].adj_close_tr) / float(l.benchmark_entry)) - 1.0) * 100.0

            hit_abs = net_pct > 0.0
            hit_bench = net_pct > bench_ret_pct
            brier = (float(l.calibrated_prob) - (1.0 if hit_bench else 0.0)) ** 2

            outcome = SignalOutcome(
                ledger_id=l.id,
                horizon_days=h,
                eval_date=exit_row.date,
                exit_price_raw=float(exit_row.close_raw),
                exit_adj_tr=exit_tr,
                dividends_net_period=0.0,
                gross_return_pct=round(gross_pct, 2),
                cost_slippage_pct=round(cost_pct, 2),
                net_return_pct=round(net_pct, 2),
                benchmark_return_pct=round(bench_ret_pct, 2),
                cdi_return_pct=0.0,
                hit_absolute=hit_abs,
                hit_excess_bench=hit_bench,
                max_adverse_excursion_pct=round(mae_pct, 2),
                brier_component=round(brier, 4),
                audited_at=now_dt,
            )
            session.add(outcome)
            audited_count += 1

    if audited_count > 0:
        try:
            session.commit()
        except Exception as exc:
            session.rollback()
            logging.error(f"❌ Erro ao gravar SignalOutcome: {exc}", exc_info=True)
            return 0
    return audited_count


def compute_signal_history_returns(session, snapshot_rows: list) -> dict[str, tuple[list[date], list[float]]]:
    """
    Carrega séries Total Return persistidas em `PriceHistoryDaily` (com fallback em `MarketData`)
    para que o backtest de `SignalsBookView` use cotações históricas reais em `t0 + 30d/90d/180d`.
    """
    from db.models import MarketData
    from db.models.signals import PriceHistoryDaily

    tickers = sorted({(r.ticker or "").strip().upper() for r in snapshot_rows if getattr(r, "ticker", None)})
    asset_ids = sorted({r.asset_id for r in snapshot_rows if getattr(r, "asset_id", None)})
    if not tickers:
        return {}

    series_by_ticker: dict[str, tuple[list[date], list[float]]] = {}
    ph_rows = (
        session.query(PriceHistoryDaily.ticker, PriceHistoryDaily.date, PriceHistoryDaily.adj_close_tr)
        .filter(PriceHistoryDaily.ticker.in_(tickers), PriceHistoryDaily.adj_close_tr > 0)
        .order_by(PriceHistoryDaily.ticker.asc(), PriceHistoryDaily.date.asc())
        .all()
    )
    tmp_dates: dict[str, list[date]] = {}
    tmp_prices: dict[str, list[float]] = {}
    for tkr, d_val, adj_val in ph_rows:
        tmp_dates.setdefault(tkr.upper(), []).append(d_val)
        tmp_prices.setdefault(tkr.upper(), []).append(float(adj_val))

    for tkr in tmp_dates:
        series_by_ticker[tkr] = (tmp_dates[tkr], tmp_prices[tkr])

    # Fallback parcial para tickers ainda não presentes em PriceHistoryDaily
    missing_tickers = {r.asset_id: r.ticker.upper() for r in snapshot_rows if r.asset_id and r.ticker.upper() not in series_by_ticker}
    if missing_tickers and asset_ids:
        md_rows = (
            session.query(MarketData.asset_id, MarketData.date, MarketData.price)
            .filter(MarketData.asset_id.in_(list(missing_tickers.keys())), MarketData.price > 0)
            .order_by(MarketData.asset_id.asc(), MarketData.date.asc())
            .all()
        )
        m_dates: dict[str, list[date]] = {}
        m_prices: dict[str, list[float]] = {}
        for aid, md_date, md_price in md_rows:
            tkr_u = missing_tickers.get(aid)
            if tkr_u and md_date and md_price:
                m_dates.setdefault(tkr_u, []).append(md_date)
                m_prices.setdefault(tkr_u, []).append(float(md_price))
        for tkr_u in m_dates:
            series_by_ticker[tkr_u] = (m_dates[tkr_u], m_prices[tkr_u])

    return series_by_ticker
