# server/domain/quant/rebalance.py
import logging
from database.models import Position
from domain.quant.helpers import _to_yf_ticker, _align_prices_to_b3

def _get_current_user_id():
    try:
        from flask import has_request_context, g
        if has_request_context() and hasattr(g, 'user_id'):
            return g.user_id
    except Exception:
        pass
    return None

def calculate_smart_rebalance(session, fetch_prices, monthly_contribution: float = 0.0) -> dict:
    logging.info(f"⚖️ Smart Rebalance (aporte R$ {monthly_contribution:.2f})...")
    import pandas as pd

    uid = _get_current_user_id()
    query = session.query(Position)
    if uid is not None:
        query = query.filter_by(user_id=uid)
    positions = query.filter(Position.quantity > 0).all()
    if not positions:
        return {"status": "Erro", "msg": "Carteira sem posições."}

    portfolio_total = 0.0
    assets_data = []
    for pos in positions:
        if not pos.asset:
            continue
        mdata = pos.asset.market_data[0] if pos.asset.market_data else None
        price = float(mdata.price or pos.average_price or 0) if mdata else float(pos.average_price or 0)
        if price <= 0:
            continue
        val = float(pos.quantity) * price
        cat = pos.asset.category
        target_pct = float(pos.target_percent or 0) / 100.0
        portfolio_total += val
        assets_data.append({
            "ticker": pos.asset.ticker.upper(),
            "category": cat.name if cat else "—",
            "price": price,
            "current_value": val,
            "target_pct": target_pct,
        })

    if portfolio_total == 0 or not assets_data:
        return {"status": "Erro", "msg": "Sem dados de mercado suficientes."}

    total_after = portfolio_total + monthly_contribution
    for a in assets_data:
        a["current_pct"] = a["current_value"] / portfolio_total
        a["target_value"] = a["target_pct"] * total_after
        a["gap_value"] = a["target_value"] - a["current_value"]
        a["gap_score"] = max(0.0, a["gap_value"] / total_after)

    corr_penalty = {a["ticker"]: 0.0 for a in assets_data}
    try:
        eq = [a for a in assets_data if a["category"] in ["Ação", "FII", "ETF", "Internacional", "Cripto"]]
        if len(eq) >= 2:
            tickers_yf = [_to_yf_ticker(a["ticker"], a["category"]) for a in eq]
            raw = fetch_prices(tickers_yf, period="6mo")
            closes = (
                raw.xs("Close", axis=1, level=1)
                if isinstance(raw.columns, pd.MultiIndex)
                else (raw["Close"] if "Close" in raw.columns else raw)
            )
            closes = _align_prices_to_b3(closes).dropna(how="all", axis=1)
            if closes.shape[1] >= 2:
                ret = closes.pct_change().dropna()
                decay_factor = 0.94
                alpha_ewma = 1.0 - decay_factor
                ewma_corr_df = ret.ewm(alpha=alpha_ewma).corr()
                cm = ewma_corr_df.xs(ret.index[-1]).fillna(0.0)
                w_map = {t: a["current_value"] / portfolio_total for a, t in zip(eq, tickers_yf)}
                for a, tyf in zip(eq, tickers_yf):
                    if tyf not in cm.columns:
                        continue
                    wc = sum(cm.loc[tyf, o] * w_map.get(o, 0) for o in cm.columns if o != tyf and o in w_map)
                    corr_penalty[a["ticker"]] = max(0.0, min(0.30, wc * 0.30))
    except Exception as e:
        logging.warning(f"⚠️ Correlação ignorada: {e}")

    suggestions = []
    for a in assets_data:
        if a["gap_value"] <= 0:
            suggestions.append({
                "ticker": a["ticker"], "category": a["category"],
                "current_pct": round(a["current_pct"] * 100, 2),
                "target_pct": round(a["target_pct"] * 100, 2),
                "gap_value": round(a["gap_value"], 2),
                "action": "MANTER", "suggested_value": 0.0,
                "suggested_lots": 0, "lot_size": 0, "score": 0.0,
                "corr_penalty": 0.0, "rationale": "Acima da meta.",
            })
            continue
        final_score = max(0.0, a["gap_score"] - corr_penalty.get(a["ticker"], 0.0))
        cat = a["category"]
        if cat == "Reserva":
            lot_size = 0
        elif cat == "Ação":
            lot_size = 100
        else:
            lot_size = 1
        suggestions.append({
            "ticker": a["ticker"], "category": cat,
            "current_pct": round(a["current_pct"] * 100, 2),
            "target_pct": round(a["target_pct"] * 100, 2),
            "gap_value": round(a["gap_value"], 2),
            "score": round(final_score, 4),
            "corr_penalty": round(corr_penalty.get(a["ticker"], 0.0), 4),
            "lot_size": lot_size, "action": "COMPRAR",
        })

    buyable = [s for s in suggestions if s["action"] == "COMPRAR"]
    score_total = sum(s["score"] for s in buyable)
    for s in buyable:
        prop = s["score"] / score_total if score_total > 0 else 0
        val_sug = monthly_contribution * prop
        price = next(a["price"] for a in assets_data if a["ticker"] == s["ticker"])
        if s["lot_size"] > 0:
            lots = max(0, int(val_sug / (price * s["lot_size"])))
            actual = lots * price * s["lot_size"]
            s["suggested_lots"] = lots
            s["suggested_value"] = round(actual, 2)
            s["rationale"] = (
                f"{lots} lote(s) × R$ {price:.2f} = R$ {actual:.2f}"
                if lots > 0 else "Aporte insuficiente para 1 lote."
            )
        else:
            qty = val_sug / price if price > 0 else 0
            s["suggested_lots"] = round(qty, 8)
            s["suggested_value"] = round(val_sug, 2)
            s["rationale"] = f"{qty:.6f} un. × R$ {price:.2f}"

    active_suggestions = []
    for s in suggestions:
        if s.get("action") == "COMPRAR" and s.get("suggested_value", 0.0) > 0:
            active_suggestions.append(s)

    active_suggestions.sort(key=lambda x: x.get("score", 0), reverse=True)
    return {
        "status": "Sucesso",
        "total_atual": round(portfolio_total, 2),
        "aporte_mensal": round(monthly_contribution, 2),
        "total_apos_aporte": round(total_after, 2),
        "sugestoes": active_suggestions,
    }
