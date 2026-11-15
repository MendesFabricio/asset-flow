# server/domain/quant/rebalance.py
import logging
from decimal import Decimal
from db.models import get_active_positions
from domain.quant.helpers import _to_yf_ticker, _align_prices_to_b3, _get_current_user_id, _extract_close_prices
from domain.quant.constants import VARIABLE_ASSET_CATEGORIES


def _pick_reserva_asset(assets_data: list, buyable_tickers: set) -> dict | None:
    """Seleciona a melhor caixinha (Reserva) para absorver sobras de arredondamento."""
    reservas = [a for a in assets_data if a["category"] == "Reserva"]
    if not reservas:
        return None
    return max(
        reservas,
        key=lambda a: (
            1 if "oportunidade" in f"{a['ticker']} {a.get('name', '')}".lower() else 0,
            1 if a["ticker"] in buyable_tickers else 0,
            a["target_pct"],
            a["current_value"],
        ),
    )


def calculate_smart_rebalance(
    session,
    fetch_prices,
    monthly_contribution: float = 0.0,
    dolar_rate: float = 1.0,
) -> dict:
    logging.info(f"⚖️ Smart Rebalance (aporte R$ {monthly_contribution:.2f})...")

    uid = _get_current_user_id()
    positions = get_active_positions(session, uid).all()
    if not positions:
        return {"status": "Erro", "msg": "Carteira sem posições."}

    portfolio_total = 0.0
    assets_data = []
    for pos in positions:
        if not pos.asset:
            continue
        mdata = pos.asset.market_data[0] if pos.asset.market_data else None
        raw_price = float(mdata.price or pos.average_price or 0) if mdata else float(pos.average_price or 0)
        if raw_price <= 0:
            continue
        fator = dolar_rate if getattr(pos.asset, "currency", "BRL") == "USD" and dolar_rate > 0 else 1.0
        price = raw_price * fator
        val = float(pos.quantity) * price
        cat = pos.asset.category
        raw_cat_target = getattr(cat, "target_percent", None) if cat else None
        if isinstance(raw_cat_target, (int, float, Decimal)):
            cat_target_pct = float(raw_cat_target) / 100.0
        else:
            cat_target_pct = 1.0
        pos_target_pct = float(pos.target_percent or 0) / 100.0
        target_pct = cat_target_pct * pos_target_pct
        portfolio_total += val
        assets_data.append({
            "ticker": pos.asset.ticker.upper(),
            "name": getattr(pos.asset, "name", "") or "",
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
        eq = [a for a in assets_data if a["category"] in VARIABLE_ASSET_CATEGORIES]
        if len(eq) >= 2:
            tickers_yf = [_to_yf_ticker(a["ticker"], a["category"]) for a in eq]
            raw = fetch_prices(tickers_yf, period="6mo")
            closes = _extract_close_prices(raw)
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
        penalty = corr_penalty.get(a["ticker"], 0.0)
        final_score = max(0.0, a["gap_score"] * (1.0 - penalty))
        cat = a["category"]
        # Reserva recebe aporte direto em R$; demais classes usam unidades inteiras
        lot_size = 0 if cat == "Reserva" else 1
        suggestions.append({
            "ticker": a["ticker"], "category": cat,
            "current_pct": round(a["current_pct"] * 100, 2),
            "target_pct": round(a["target_pct"] * 100, 2),
            "gap_value": round(a["gap_value"], 2),
            "score": round(final_score, 4),
            "corr_penalty": round(penalty, 4),
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
            s["suggested_lots"] = 0
            s["suggested_value"] = round(val_sug, 2)
            s["rationale"] = f"Aporte direto em Reserva: R$ {val_sug:.2f}"

    allocated_total = sum(s.get("suggested_value", 0.0) for s in buyable)
    sobra = round(monthly_contribution - allocated_total, 2)
    reserva_sobra = 0.0
    if sobra > 0.01:
        buyable_tickers = {s["ticker"] for s in buyable if s.get("suggested_value", 0.0) > 0}
        reserva_target = _pick_reserva_asset(assets_data, buyable_tickers)
        if reserva_target:
            sug = next((s for s in suggestions if s["ticker"] == reserva_target["ticker"]), None)
            if sug:
                prev_val = float(sug.get("suggested_value", 0.0)) if sug.get("action") == "COMPRAR" else 0.0
                sug["action"] = "COMPRAR"
                sug["lot_size"] = 0
                sug["suggested_lots"] = 0
                sug["suggested_value"] = round(prev_val + sobra, 2)
                if prev_val > 0:
                    sug["rationale"] = f"Aporte em Reserva (R$ {prev_val:.2f}) + R$ {sobra:.2f} de sobra de arredondamento."
                else:
                    sug["rationale"] = f"Sobra de arredondamento (R$ {sobra:.2f}) direcionada para a caixinha."
                reserva_sobra = sobra
                sobra = 0.0

    active_suggestions = [
        s for s in suggestions
        if s.get("action") == "COMPRAR" and s.get("suggested_value", 0.0) > 0
    ]

    active_suggestions.sort(key=lambda x: x.get("score", 0), reverse=True)
    return {
        "status": "Sucesso",
        "total_atual": round(portfolio_total, 2),
        "aporte_mensal": round(monthly_contribution, 2),
        "total_apos_aporte": round(total_after, 2),
        "sobra": max(0.0, sobra),
        "reserva_sobra": reserva_sobra,
        "sugestoes": active_suggestions,
    }
