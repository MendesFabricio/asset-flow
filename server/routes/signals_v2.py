"""
server/routes/signals_v2.py
Endpoints v2 do Motor de Pontos de Compra Estatísticos (Walk-Forward, Wilson, Regime, Brier Score)
e da Ponte de Caixa Livre 30d (Proventos Provisionados + Contas a Receber).
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from decimal import Decimal

from flask import Blueprint, g, jsonify, request
from sqlalchemy.orm import joinedload

from db.models import (
    Asset,
    AssetTransaction,
    Category,
    Debtor,
    Dividend,
    LoanInstallment,
    MarketScreenerItem,
    Position,
    ReceivableLoan,
    Session,
)
from domain.portfolio.ledger_replay import compute_qty_at_date
from domain.signals.ledger import (
    audit_matured_signal_outcomes,
    capture_daily_signals_to_ledger,
    sync_price_history_from_yf,
)
from domain.signals.regime import get_latest_market_regime
from domain.signals.walk_forward import (
    SETUPS_BY_CLASS,
    _evaluate_setup_trigger,
    infer_signal_asset_class,
    recalibrate_all_setups,
)
from domain.signals.wilson import (
    classify_confidence_tier,
    compute_brier_and_curve,
)


signals_v2_bp = Blueprint("signals_v2", __name__)


def _parse_horizon() -> int:
    try:
        h = int(request.args.get("horizon", 90))
        return h if h in (30, 90, 180, 365) else 90
    except (TypeError, ValueError):
        return 90


def compute_free_cash_bridge(session, user_id: int, window_days: int = 30) -> dict:
    """
    Calcula a Ponte de Caixa Livre para os próximos `window_days` dias:
    - Proventos Provisionados / A Receber no período (quantidade reconstruída na Data-Com)
    - Contas a Receber abertas no período (descontando pagamentos parciais; vencidos separados)
    - Reserva faltante (meta Reserva) como informação auxiliar
    """
    today = date.today()
    horizon_end = today + timedelta(days=max(1, min(int(window_days), 180)))

    # 1. Proventos A RECEBER / PROVISIONADO na janela [today, horizon_end]
    div_rows = (
        session.query(Dividend, Asset)
        .join(Asset, Dividend.asset_id == Asset.id)
        .filter(
            Dividend.user_id == user_id,
            Dividend.status != "PAGO",
            Dividend.date_payment.isnot(None),
            Dividend.date_payment >= today,
            Dividend.date_payment <= horizon_end,
        )
        .order_by(Dividend.date_payment.asc())
        .all()
    )

    txs_by_asset: dict[int, list] = {}
    div_asset_ids = list({d.asset_id for d, _a in div_rows})
    pos_qty_by_asset: dict[int, float] = {}
    if div_asset_ids:
        for p in (
            session.query(Position)
            .filter(Position.user_id == user_id, Position.asset_id.in_(div_asset_ids))
            .all()
        ):
            pos_qty_by_asset[p.asset_id] = float(p.quantity or 0.0)
        for tx in (
            session.query(AssetTransaction, Position)
            .join(Position, AssetTransaction.position_id == Position.id)
            .filter(
                AssetTransaction.user_id == user_id,
                Position.asset_id.in_(div_asset_ids),
            )
            .order_by(AssetTransaction.transaction_date.asc(), AssetTransaction.id.asc())
            .all()
        ):
            txs_by_asset.setdefault(tx[1].asset_id, []).append(tx[0])

    div_items = []
    dividends_total = 0.0
    for div_row, asset_row in div_rows:
        d_com = div_row.date_com
        fallback_q = pos_qty_by_asset.get(asset_row.id, float(div_row.quantity_at_date or 0.0))
        if d_com and d_com <= today and txs_by_asset.get(asset_row.id):
            qty_at = compute_qty_at_date(txs_by_asset[asset_row.id], d_com, fallback_qty=fallback_q)
        else:
            qty_at = fallback_q

        if qty_at <= 0:
            continue

        val_ps = float(div_row.value_per_share or 0.0)
        if val_ps > 0 and float(div_row.quantity_at_date or 0.0) > 0:
            # Preserva razão líquido/bruto de JCP armazenada em total_value
            unit_net = float(div_row.total_value or 0.0) / float(div_row.quantity_at_date)
            net_total = round(unit_net * qty_at, 2)
        else:
            net_total = round(float(div_row.total_value or 0.0), 2)

        if net_total <= 0:
            continue
        dividends_total += net_total
        div_items.append({
            "ticker": asset_row.ticker,
            "type": div_row.type or "Dividendo",
            "date_com": d_com.isoformat() if d_com else None,
            "date_payment": div_row.date_payment.isoformat() if div_row.date_payment else None,
            "qty_at_date_com": round(qty_at, 4),
            "net_total": net_total,
        })

    # 2. Contas a Receber (LoanInstallment abertas)
    inst_rows = (
        session.query(LoanInstallment, ReceivableLoan, Debtor)
        .join(ReceivableLoan, LoanInstallment.loan_id == ReceivableLoan.id)
        .join(Debtor, ReceivableLoan.debtor_id == Debtor.id)
        .options(joinedload(LoanInstallment.transactions))
        .filter(
            LoanInstallment.user_id == user_id,
            LoanInstallment.is_deleted.is_(False),
            ReceivableLoan.is_deleted.is_(False),
            Debtor.is_deleted.is_(False),
            LoanInstallment.status != "PAGA",
        )
        .order_by(LoanInstallment.data_vencimento.asc())
        .all()
    )

    rec_items = []
    receivables_total = 0.0
    receivables_overdue = 0.0
    for inst, loan, debtor in inst_rows:
        paid = sum(Decimal(str(t.valor_pago or 0)) for t in (inst.transactions or []))
        rem = float(max(Decimal("0.0"), Decimal(str(inst.valor_parcela or 0)) - paid))
        if rem <= 0.01:
            continue
        due_dt = inst.data_vencimento.date() if hasattr(inst.data_vencimento, "date") else inst.data_vencimento
        if due_dt is None:
            continue
        if due_dt < today:
            receivables_overdue += rem
        elif due_dt <= horizon_end:
            rem_r = round(rem, 2)
            receivables_total += rem_r
            rec_items.append({
                "id": inst.id,
                "debtor": debtor.nome,
                "loan_desc": loan.descricao,
                "due_date": due_dt.isoformat(),
                "remaining": rem_r,
            })

    # 3. Reserva faltante (apenas informativo se Reserva estiver abaixo da meta macro)
    reserve_gap = 0.0
    reserve_positions = (
        session.query(Position, Asset, Category)
        .join(Asset, Position.asset_id == Asset.id)
        .join(Category, Asset.category_id == Category.id)
        .filter(Position.user_id == user_id)
        .all()
    )
    if reserve_positions:
        total_port = 0.0
        reserve_cur = 0.0
        reserve_target_pct = 0.0
        for p, a, c in reserve_positions:
            m_list = a.market_data
            px = float(m_list[0].price) if (m_list and m_list[0].price) else float(p.average_price or 0.0)
            val = float(p.quantity or 0.0) * px
            total_port += val
            if c.name == "Reserva":
                reserve_cur += val
                reserve_target_pct = float(c.target_percent or 0.0)
        if total_port > 0 and reserve_target_pct > 0:
            reserve_gap = round(max(0.0, total_port * (reserve_target_pct / 100.0) - reserve_cur), 2)

    net_free_cash = round(dividends_total + receivables_total, 2)
    return {
        "status": "Sucesso",
        "window_days": window_days,
        "as_of_date": today.isoformat(),
        "components": {
            "dividends_30d": round(dividends_total, 2),
            "receivables_30d": round(receivables_total, 2),
            "receivables_overdue_excluded": round(receivables_overdue, 2),
        },
        "net_free_cash_30d": net_free_cash,
        "reserve_gap": reserve_gap,
        "items": {
            "dividends": div_items,
            "receivables": rec_items,
        },
    }


@signals_v2_bp.route("/api/cashflow/free-cash-bridge", methods=["GET"])
def get_free_cash_bridge():
    try:
        window_days = min(max(int(request.args.get("window_days", 30)), 1), 180)
    except (TypeError, ValueError):
        window_days = 30

    with Session() as session:
        try:
            payload = compute_free_cash_bridge(session, g.user_id, window_days=window_days)
            return jsonify(payload)
        except Exception as exc:
            logging.error(f"❌ Erro ao calcular Ponte de Caixa Livre: {exc}", exc_info=True)
            return jsonify({"status": "Erro", "msg": str(exc)}), 500


@signals_v2_bp.route("/api/signals/v2/opportunities", methods=["GET"])
def get_signals_v2_opportunities():
    horizon = _parse_horizon()
    ticker_filter = (request.args.get("ticker") or "").strip().upper().replace(".SA", "")

    from db.models.signals import (
        FundamentalSnapshot,
        PriceHistoryDaily,
        SignalLedger,
        SignalOutcome,
        SignalSetupStat,
    )

    with Session() as session:
        try:
            regime = get_latest_market_regime(session)
            today = date.today()

            ticker_filter = (request.args.get("ticker") or "").strip().upper()
            universe = (request.args.get("universe") or "all").strip().lower()
            if universe not in ("all", "portfolio", "market"):
                universe = "all"
            try:
                min_volume = float(request.args.get("min_volume", 1_000_000))
            except (TypeError, ValueError):
                min_volume = 1_000_000.0

            from db.models import MarketScreenerItem
            from db.models.signals import FundamentalSnapshot, PriceHistoryDaily

            stats_map = {
                (s.setup_code, s.asset_class): s
                for s in session.query(SignalSetupStat)
                .filter_by(regime_bucket="GLOBAL", horizon_days=horizon)
                .all()
            }

            outcome_rows = (
                session.query(SignalLedger, SignalOutcome)
                .join(SignalOutcome, SignalOutcome.ledger_id == SignalLedger.id)
                .filter(SignalOutcome.horizon_days == horizon)
                .all()
            )
            calibration_summary = compute_brier_and_curve(outcome_rows)
            calibration_summary["horizon_days"] = horizon

            # Monta universo combinado: Posições da carteira + Radar B3 (MarketScreenerItem)
            positions = (
                session.query(Position, Asset, Category)
                .join(Asset, Position.asset_id == Asset.id)
                .outerjoin(Category, Asset.category_id == Category.id)
                .filter(Position.user_id == g.user_id)
                .all()
            )

            candidates: dict[str, dict] = {}
            for pos, asset, cat in positions:
                cat_name = cat.name if cat else ""
                if cat_name in ("Reserva", "Renda Fixa", "Cripto"):
                    continue
                tkr = asset.ticker.strip().upper()
                if ticker_filter and tkr != ticker_filter:
                    continue
                mdata = asset.market_data[0] if asset.market_data else None
                is_active = float(pos.quantity or 0) > 0
                candidates[tkr] = {
                    "ticker": tkr,
                    "cat_name": cat_name,
                    "in_portfolio": is_active,
                    "fallback_price": float(mdata.price) if (mdata and mdata.price) else float(pos.average_price or 0.0),
                    "fallback_rsi": float(mdata.rsi_14) if (mdata and mdata.rsi_14 is not None) else 50.0,
                    "fallback_sma20": float(mdata.sma_20) if (mdata and mdata.sma_20) else 0.0,
                }

            if universe in ("all", "market"):
                for scr in session.query(MarketScreenerItem).all():
                    tkr = (scr.ticker or "").strip().upper()
                    if not tkr or (ticker_filter and tkr != ticker_filter) or tkr in candidates:
                        continue
                    cat_name = scr.asset_type or "Ação"
                    if cat_name in ("Reserva", "Renda Fixa", "Cripto"):
                        continue
                    candidates[tkr] = {
                        "ticker": tkr,
                        "cat_name": cat_name,
                        "in_portfolio": False,
                        "fallback_price": float(scr.price or 0.0),
                        "fallback_rsi": 50.0,
                        "fallback_sma20": 0.0,
                        "screener_item": scr,
                    }

            opportunities = []
            seen_pairs = set()
            for tkr, meta in candidates.items():
                if universe == "portfolio" and not meta["in_portfolio"]:
                    continue
                if universe == "market" and meta["in_portfolio"]:
                    continue

                asset_class = infer_signal_asset_class(meta["cat_name"], tkr)
                recent_px_rows = (
                    session.query(PriceHistoryDaily)
                    .filter_by(ticker=tkr)
                    .order_by(PriceHistoryDaily.date.desc())
                    .limit(63)
                    .all()
                )
                latest_px = recent_px_rows[0] if recent_px_rows else None
                vols = [
                    float(r.close_raw or 0) * float(r.volume or 0)
                    for r in recent_px_rows
                    if (r.close_raw or 0) > 0 and (r.volume or 0) > 0
                ]
                avg_vol_21d = (sorted(vols)[len(vols) // 2]) if len(vols) >= 5 else ((sum(vols) / len(vols)) if vols else None)

                # Índice de Amihud (impacto de preço por R$ 1B negociado)
                amihud_vals = []
                for idx_r in range(len(recent_px_rows) - 1):
                    r_cur = recent_px_rows[idx_r]
                    r_prev = recent_px_rows[idx_r + 1]
                    dv = float(r_cur.close_raw or 0) * float(r_cur.volume or 0)
                    if dv > 0 and (r_cur.close_raw or 0) > 0 and (r_prev.close_raw or 0) > 0:
                        ret_abs = abs((float(r_cur.close_raw) / float(r_prev.close_raw)) - 1.0)
                        amihud_vals.append((ret_abs / dv) * 1e9)
                amihud_idx = round(sum(amihud_vals) / len(amihud_vals), 3) if amihud_vals else None
                if avg_vol_21d is None:
                    liq_grade = None
                elif avg_vol_21d >= 20_000_000:
                    liq_grade = "Muito Alta"
                elif avg_vol_21d >= 5_000_000:
                    liq_grade = "Alta"
                elif avg_vol_21d >= 1_000_000:
                    liq_grade = "Moderada"
                else:
                    liq_grade = "Baixa"

                # Exige liquidez mínima para ativos de mercado fora da carteira
                if not meta["in_portfolio"] and not ticker_filter:
                    if avg_vol_21d is None or avg_vol_21d < min_volume:
                        continue

                px_val = float(latest_px.adj_close_tr) if (latest_px and latest_px.adj_close_tr) else meta["fallback_price"]
                if px_val <= 0:
                    continue
                spot_px = float(latest_px.close_raw) if (latest_px and latest_px.close_raw) else meta["fallback_price"]
                entry_px = spot_px if spot_px > 0 else px_val

                rsi_val = float(latest_px.rsi_14) if (latest_px and latest_px.rsi_14 is not None) else meta["fallback_rsi"]
                sma20_val = float(latest_px.sma_20) if (latest_px and latest_px.sma_20) else (meta["fallback_sma20"] or px_val)
                sma50_val = float(latest_px.sma_50) if (latest_px and latest_px.sma_50) else px_val
                sma200_val = float(latest_px.sma_200) if (latest_px and latest_px.sma_200) else px_val

                pit_fund = (
                    session.query(FundamentalSnapshot)
                    .filter(FundamentalSnapshot.ticker == tkr, FundamentalSnapshot.filing_date <= today)
                    .order_by(FundamentalSnapshot.filing_date.desc())
                    .first()
                )
                if pit_fund is None:
                    pit_fund = meta.get("screener_item") or session.query(MarketScreenerItem).filter_by(ticker=tkr).first()

                for setup_code in SETUPS_BY_CLASS.get(asset_class, ()):
                    fired, triggers = _evaluate_setup_trigger(
                        setup_code, px_val, rsi_val, sma20_val, sma50_val, sma200_val, pit_fund
                    )
                    if not fired and not ticker_filter:
                        continue
                    key = (tkr, setup_code)
                    if key in seen_pairs:
                        continue
                    seen_pairs.add(key)

                    stat = stats_map.get((setup_code, asset_class))
                    n_samp = int(stat.sample_size_n) if stat else 0
                    oos_n = int(stat.oos_sample_n) if stat else 0
                    win_rate = float(stat.win_rate) if stat else 0.0
                    wlb_90 = float(stat.wilson_lb_90) if stat else 0.0
                    wlb_95 = float(stat.wilson_lb_95) if stat else 0.0
                    cal_prob = float(stat.calibrated_prob) if stat else 0.50
                    exp_net = float(stat.expectancy_net) if stat else 0.0
                    avg_ret = float(stat.avg_return) if (stat and stat.avg_return is not None) else exp_net
                    pf = stat.profit_factor if stat else None
                    mae = float(stat.max_drawdown_mae) if stat else 0.0
                    oos_cons = float(stat.oos_consistency_score) if stat else 0.0

                    upside_ratio = min(0.60, max(0.03, avg_ret if avg_ret > 0 else max(exp_net, 0.05)))
                    mae_abs = min(0.45, max(0.03, abs(mae) if mae < 0 else 0.08))
                    target_px = round(entry_px * (1.0 + upside_ratio), 2)
                    risk_px = round(entry_px * (1.0 - mae_abs), 2)

                    tier = classify_confidence_tier(n_samp, oos_n, wlb_90, wlb_95, exp_net, pf, oos_cons)
                    opportunities.append({
                        "ticker": tkr,
                        "asset_class": asset_class,
                        "in_portfolio": meta["in_portfolio"],
                        "avg_daily_volume_21d": round(avg_vol_21d, 0) if avg_vol_21d is not None else None,
                        "amihud_illiquidity": amihud_idx,
                        "liquidity_grade": liq_grade,
                        "setup_code": setup_code,
                        "triggered": fired,
                        "confidence_tier": tier,
                        "calibrated_prob": round(cal_prob, 4),
                        "wilson_lb_90": round(wlb_90, 4),
                        "wilson_lb_95": round(wlb_95, 4),
                        "sample_size_n": n_samp,
                        "oos_sample_n": oos_n,
                        "win_rate": round(win_rate, 4),
                        "expectancy_net": round(exp_net, 4),
                        "profit_factor": pf,
                        "max_drawdown_mae": round(mae, 4),
                        "oos_consistency_score": round(oos_cons, 4),
                        "entry_price": round(entry_px, 2),
                        "target_price": target_px,
                        "target_upside_pct": round(upside_ratio * 100.0, 1),
                        "risk_price": risk_px,
                        "risk_drawdown_pct": round(-mae_abs * 100.0, 1),
                        "horizon_days": horizon,
                        "triggers": triggers,
                    })

            tier_rank = {"ALTA_CERTEZA": 0, "MODERADA": 1, "BAIXA": 2, "INSUFFICIENT_SAMPLE": 3}
            opportunities.sort(
                key=lambda x: (
                    0 if x["triggered"] else 1,
                    tier_rank.get(x["confidence_tier"], 9),
                    -float(x["wilson_lb_95"]),
                )
            )
            return jsonify({
                "status": "Sucesso",
                "regime": regime,
                "calibration_summary": calibration_summary,
                "opportunities": opportunities,
            })
        except Exception as exc:
            logging.error(f"❌ Erro em /api/signals/v2/opportunities: {exc}", exc_info=True)
            return jsonify({"status": "Erro", "msg": str(exc)}), 500


@signals_v2_bp.route("/api/signals/v2/calibration", methods=["GET"])
def get_signals_v2_calibration():
    horizon = _parse_horizon()
    from db.models.signals import SignalLedger, SignalOutcome, SignalSetupStat

    with Session() as session:
        try:
            regime = get_latest_market_regime(session)
            outcome_rows = (
                session.query(SignalLedger, SignalOutcome)
                .join(SignalOutcome, SignalOutcome.ledger_id == SignalLedger.id)
                .filter(SignalOutcome.horizon_days == horizon)
                .all()
            )
            cal = compute_brier_and_curve(outcome_rows)
            cal["horizon_days"] = horizon

            stats_rows = (
                session.query(SignalSetupStat)
                .filter_by(horizon_days=horizon)
                .order_by(SignalSetupStat.asset_class.asc(), SignalSetupStat.wilson_lb_95.desc())
                .all()
            )
            setups = []
            for s in stats_rows:
                tier = classify_confidence_tier(
                    s.sample_size_n,
                    s.oos_sample_n,
                    s.wilson_lb_90,
                    s.wilson_lb_95,
                    s.expectancy_net,
                    s.profit_factor,
                    s.oos_consistency_score,
                )
                setups.append({
                    "setup_code": s.setup_code,
                    "asset_class": s.asset_class,
                    "regime_bucket": s.regime_bucket,
                    "horizon_days": s.horizon_days,
                    "confidence_tier": tier,
                    "sample_size_n": s.sample_size_n,
                    "oos_sample_n": s.oos_sample_n,
                    "wins": s.wins,
                    "win_rate": s.win_rate,
                    "wilson_lb_90": s.wilson_lb_90,
                    "wilson_lb_95": s.wilson_lb_95,
                    "calibrated_prob": s.calibrated_prob,
                    "expectancy_net": s.expectancy_net,
                    "excess_return_vs_bench": s.excess_return_vs_bench,
                    "profit_factor": s.profit_factor,
                    "avg_return": s.avg_return,
                    "median_return": s.median_return,
                    "max_drawdown_mae": s.max_drawdown_mae,
                    "oos_consistency_score": s.oos_consistency_score,
                })

            return jsonify({
                "status": "Sucesso",
                "regime": regime,
                "calibration": cal,
                "setups": setups,
            })
        except Exception as exc:
            logging.error(f"❌ Erro em /api/signals/v2/calibration: {exc}", exc_info=True)
            return jsonify({"status": "Erro", "msg": str(exc)}), 500


@signals_v2_bp.route("/api/signals/v2/recalibrate", methods=["POST"])
def trigger_signals_v2_recalibration():
    body = request.get_json(silent=True) or {}
    sync_prices = bool(body.get("sync_prices", True))

    with Session() as session:
        try:
            synced = 0
            if sync_prices:
                pos_rows = (
                    session.query(Asset.ticker, Category.name)
                    .join(Position, Position.asset_id == Asset.id)
                    .outerjoin(Category, Asset.category_id == Category.id)
                    .filter(Position.user_id == g.user_id)
                    .distinct()
                    .all()
                )
                tickers_cat = [
                    (t, c or "Ação")
                    for t, c in pos_rows
                    if (c or "") not in ("Reserva", "Renda Fixa", "Cripto")
                ]
                if tickers_cat:
                    synced = sync_price_history_from_yf(session, tickers_cat, period="2y")

            stats = recalibrate_all_setups(session)
            captured = capture_daily_signals_to_ledger(session, user_id=g.user_id)
            audited = audit_matured_signal_outcomes(session)
            return jsonify({
                "status": "Sucesso",
                "prices_synced": synced,
                "setups_updated": len(stats),
                "signals_captured": len(captured),
                "outcomes_audited": audited,
            })
        except Exception as exc:
            logging.error(f"❌ Erro ao recalibrar Motor de Sinais v2: {exc}", exc_info=True)
            return jsonify({"status": "Erro", "msg": str(exc)}), 500
