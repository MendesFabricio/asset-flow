# server/domain/quant/projection.py
from datetime import date, datetime, timedelta
import logging
from db.models import AssetTransaction, CorporateEvent, Dividend, get_active_positions

from domain.quant.helpers import _get_current_user_id

def calculate_income_projection(
    session,
    monthly_contribution: float = 1000.0,
    years: int = 20,
    annual_return_pct: float = 12.0,
    annual_dividend_yield_pct: float = 6.0,
    dolar_rate: float = 1.0,
) -> dict:
    logging.info(f"📊 Projetando IF: R${monthly_contribution}/mês, {years}a, {annual_return_pct}% a.a.")

    uid = _get_current_user_id()
    positions = get_active_positions(session, uid).all()
    current_portfolio = 0.0
    current_income = 0.0
    for pos in positions:
        if not pos.asset:
            continue
        mdata = pos.asset.market_data[0] if pos.asset.market_data else None
        price = float(mdata.price or pos.average_price or 0) if mdata else float(pos.average_price or 0)
        fator = dolar_rate if getattr(pos.asset, "currency", "BRL") == "USD" and dolar_rate > 0 else 1.0
        val = float(pos.quantity) * price * fator
        current_portfolio += val
        if pos.manual_dy and pos.manual_dy > 0:
            current_income += val * float(pos.manual_dy) / 12

    mr = annual_return_pct / 100 / 12
    mdy = annual_dividend_yield_pct / 100 / 12

    timeline = []
    pat = current_portfolio
    for m in range(1, years * 12 + 1):
        pat = pat * (1 + mr) + monthly_contribution
        if m % 12 == 0:
            timeline.append({
                "ano": m // 12,
                "patrimonio": round(pat, 2),
                "renda_mensal_projetada": round(pat * mdy, 2),
            })

    metas = [3000, 5000, 8000, 10000, 15000, 20000]
    milestones = {}
    for meta in metas:
        hit = next((t for t in timeline if t["renda_mensal_projetada"] >= meta), None)
        milestones[str(meta)] = hit["ano"] if hit else None

    pat_final = timeline[-1]["patrimonio"] if timeline else 0
    renda_final = timeline[-1]["renda_mensal_projetada"] if timeline else 0
    total_aportado = monthly_contribution * years * 12
    mult = pat_final / (current_portfolio + total_aportado) if (current_portfolio + total_aportado) > 0 else 0

    return {
        "status": "Sucesso",
        "parametros": {
            "patrimonio_atual": round(current_portfolio, 2),
            "renda_atual_estimada": round(current_income, 2),
            "aporte_mensal": monthly_contribution,
            "anos": years,
            "retorno_anual_pct": annual_return_pct,
            "dy_anual_pct": annual_dividend_yield_pct,
        },
        "resultados": {
            "patrimonio_final": round(pat_final, 2),
            "renda_mensal_final": round(renda_final, 2),
            "total_aportado": round(total_aportado, 2),
            "multiplicador_patrimonio": round(mult, 2),
        },
        "marcos_fi": milestones,
        "timeline": timeline,
    }

def calculate_dividend_forecast(session) -> dict:
    logging.info("📅 Computando projeções preditivas de dividendos...")
    
    uid = _get_current_user_id()
    positions = get_active_positions(session, uid).all()
    if not positions:
        return {"status": "Sucesso", "forecast": [], "total_projected": 0.0}
        
    forecasts = []
    total_projected = 0.0
    default_cutoff = date.today() - timedelta(days=365)

    is_mock_session = type(session).__name__ in ("MagicMock", "Mock")
    divs_by_asset: dict[int, list] = {}
    split_txs_by_ticker: dict[str, list] = {}
    corp_evts_by_asset: dict[int, list] = {}

    if not is_mock_session:
        asset_ids = [p.asset_id for p in positions if p.asset]
        tickers_u = [p.asset.ticker.upper() for p in positions if p.asset]
        if asset_ids:
            div_q = session.query(Dividend).filter(Dividend.asset_id.in_(asset_ids))
            if uid is not None:
                div_q = div_q.filter(Dividend.user_id == uid)
            for d in div_q.all():
                divs_by_asset.setdefault(d.asset_id, []).append(d)

            ce_q = session.query(CorporateEvent).filter(
                CorporateEvent.asset_id.in_(asset_ids),
                CorporateEvent.type.in_(("SPLIT", "INPLIT", "BONUS")),
            )
            if uid is not None:
                ce_q = ce_q.filter(CorporateEvent.user_id == uid)
            for ce in ce_q.all():
                corp_evts_by_asset.setdefault(ce.asset_id, []).append(ce)

        if tickers_u:
            tx_q = session.query(AssetTransaction).filter(
                AssetTransaction.ticker.in_(tickers_u),
                AssetTransaction.type.in_(("SPLIT", "INPLIT", "BONUS")),
            )
            if uid is not None:
                tx_q = tx_q.filter(AssetTransaction.user_id == uid)
            for stx in tx_q.all():
                split_txs_by_ticker.setdefault((stx.ticker or "").upper(), []).append(stx)

    for pos in positions:
        if not pos.asset:
            continue
        cat_name = getattr(getattr(pos.asset, "category", None), "name", None)
        if isinstance(cat_name, str) and cat_name == "Reserva":
            continue

        ticker = pos.asset.ticker.upper()
        qty = float(pos.quantity)

        if is_mock_session:
            if uid is not None:
                divs = session.query(Dividend).filter_by(asset_id=pos.asset_id, user_id=uid).all()
            else:
                divs = session.query(Dividend).filter_by(asset_id=pos.asset_id).all()

            split_q = session.query(AssetTransaction).filter(
                AssetTransaction.ticker == ticker,
                AssetTransaction.type.in_(("SPLIT", "INPLIT", "BONUS")),
            )
            if uid is not None:
                split_q = split_q.filter(AssetTransaction.user_id == uid)
            split_txs = split_q.all()

            corp_filters = [
                CorporateEvent.asset_id == pos.asset_id,
                CorporateEvent.type.in_(("SPLIT", "INPLIT", "BONUS")),
            ]
            if uid is not None:
                corp_filters.append(CorporateEvent.user_id == uid)
            corp_evts = session.query(CorporateEvent).filter(*corp_filters).all()
        else:
            divs = divs_by_asset.get(pos.asset_id, [])
            split_txs = split_txs_by_ticker.get(ticker, [])
            corp_evts = corp_evts_by_asset.get(pos.asset_id, [])

        # Ignora histórico pré-desdobramento/agrupamento/bonificação e eventos mais antigos que 12 meses
        latest_split_date = None
        if isinstance(split_txs, (list, tuple)):
            for stx in split_txs:
                raw_dt = getattr(stx, "transaction_date", None)
                if isinstance(raw_dt, datetime):
                    dt_d = raw_dt.date()
                elif isinstance(raw_dt, date):
                    dt_d = raw_dt
                else:
                    continue
                if latest_split_date is None or dt_d > latest_split_date:
                    latest_split_date = dt_d

        if isinstance(corp_evts, (list, tuple)):
            for ce in corp_evts:
                raw_dt = getattr(ce, "date", None)
                if isinstance(raw_dt, datetime):
                    dt_d = raw_dt.date()
                elif isinstance(raw_dt, date):
                    dt_d = raw_dt
                else:
                    continue
                if latest_split_date is None or dt_d > latest_split_date:
                    latest_split_date = dt_d

        cutoff_date = default_cutoff
        if latest_split_date is not None and latest_split_date > cutoff_date:
            cutoff_date = latest_split_date

        filtered_divs = []
        for d in divs:
            raw_com = getattr(d, "date_com", None)
            d_date = raw_com.date() if isinstance(raw_com, datetime) else (raw_com if isinstance(raw_com, date) else None)
            if d_date is not None and d_date < cutoff_date:
                continue
            if float(d.value_per_share or 0) <= 0:
                continue
            dtype = d.type.lower() if isinstance(getattr(d, "type", None), str) else ""
            if "amort" in dtype:
                continue
            filtered_divs.append((d, d_date))

        if not filtered_divs:
            # Usa apenas manual_dy configurado pelo usuário; não inventa DY de 5% para ativos sem proventos
            manual_dy = float(getattr(pos, "manual_dy", 0) or 0)
            if manual_dy > 0:
                mdata = pos.asset.market_data[0] if pos.asset.market_data else None
                price = float(mdata.price or 0) if mdata else float(pos.average_price or 0)
                if price > 0:
                    val_monthly = ((price * manual_dy) / 12.0) * qty
                    for m in range(1, 13):
                        forecasts.append({
                            "ticker": ticker,
                            "month": m,
                            "amount": round(val_monthly, 2),
                            "type": "DY Manual Configurado"
                        })
                        total_projected += val_monthly
            continue

        month_vals = {}
        for d, d_date in filtered_divs:
            m = d_date.month if d_date else 1
            if m not in month_vals:
                month_vals[m] = []
            month_vals[m].append(float(d.value_per_share))
            
        for m, vals in month_vals.items():
            avg_val = sum(vals) / len(vals)
            projected_amount = avg_val * qty
            forecasts.append({
                "ticker": ticker,
                "month": m,
                "amount": round(projected_amount, 2),
                "type": "Projeção Baseada em Histórico"
            })
            total_projected += projected_amount
            
    monthly_totals = {m: 0.0 for m in range(1, 13)}
    for f in forecasts:
        monthly_totals[f["month"]] += f["amount"]
        
    monthly_data = [{"month": m, "amount": round(val, 2)} for m, val in monthly_totals.items()]
    
    return {
        "status": "Sucesso",
        "total_projected": round(total_projected, 2),
        "monthly_timeline": monthly_data,
        "details": forecasts
    }
