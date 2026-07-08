# server/domain/quant/projection.py
import logging
from database.models import Position, Dividend, get_active_positions

from domain.quant.helpers import _get_current_user_id

def calculate_income_projection(
    session,
    monthly_contribution: float = 1000.0,
    years: int = 20,
    annual_return_pct: float = 12.0,
    annual_dividend_yield_pct: float = 6.0,
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
        val = float(pos.quantity) * price
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
    
    for pos in positions:
        if not pos.asset:
            continue
        ticker = pos.asset.ticker.upper()
        qty = float(pos.quantity)
        
        # Filtra dividendos do ativo pertencentes ao usuario
        if uid is not None:
            divs = session.query(Dividend).filter_by(asset_id=pos.asset_id, user_id=uid).all()
        else:
            divs = session.query(Dividend).filter_by(asset_id=pos.asset_id).all()
        if not divs:
            mdata = pos.asset.market_data[0] if pos.asset.market_data else None
            price = float(mdata.price or 0) if mdata else float(pos.average_price or 0)
            if price > 0:
                est_annual = price * 0.05
                val_monthly = (est_annual / 12) * qty
                for m in range(1, 13):
                    forecasts.append({
                        "ticker": ticker,
                        "month": m,
                        "amount": round(val_monthly, 2),
                        "type": "Estimativa (DY Histórico)"
                    })
                    total_projected += val_monthly
            continue
            
        month_vals = {}
        for d in divs:
            m = d.date_com.month if d.date_com else 1
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
