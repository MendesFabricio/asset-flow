"""
domain/quant_engine.py
Motor quantitativo isolado: Monte Carlo GBM, Risk Metrics,
Correlação, Smart Rebalance, Projeção de IF.

Recebe `session` e `fetch_prices` por injeção de dependência
para evitar import circular com services.py.
"""
import logging
import numpy as np
import pandas as pd
from datetime import datetime
import time
import requests
import threading

_SELIC_CACHE = {
    "rate": 0.105,
    "last_updated": 0.0
}
_SELIC_CACHE_LOCK = threading.Lock()

def get_risk_free_rate() -> float:
    """
    Busca a taxa SELIC atual via API do Banco Central com cache de 24 horas
    e fallback seguro de 10.5% (0.105).
    """
    global _SELIC_CACHE
    now = time.time()
    
    # Cache expira após 24 horas (86400 segundos)
    if now - _SELIC_CACHE["last_updated"] < 86400:
        return _SELIC_CACHE["rate"]
        
    with _SELIC_CACHE_LOCK:
        if now - _SELIC_CACHE["last_updated"] < 86400:
            return _SELIC_CACHE["rate"]
            
        try:
            url = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.1178/dados/ultimos/1?formato=json"
            response = requests.get(url, timeout=5)
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list) and len(data) > 0:
                    rate_pct = float(data[0]["valor"])
                    rate = rate_pct / 100.0
                    _SELIC_CACHE["rate"] = rate
                    _SELIC_CACHE["last_updated"] = now
                    logging.info(f"🏦 Taxa Selic atualizada via Banco Central: {rate_pct:.2f}%")
                    return rate
        except Exception as e:
            logging.warning(f"⚠️ Falha ao buscar taxa Selic do Banco Central: {e}. Usando fallback.")
            
        _SELIC_CACHE["last_updated"] = now - 86400 + 3600
        return _SELIC_CACHE["rate"]


# ─── helpers de ticker ───────────────────────────────────────────────────────

def _to_yf_ticker(ticker: str, category: str) -> str:
    """Normaliza ticker para o formato Yahoo Finance."""
    t = ticker.strip().upper()
    if t.endswith(".SA") or t.endswith("-USD"):
        return t
    is_intl = category == "Internacional"
    if not is_intl or any(t.endswith(s) for s in ["39", "34", "33", "11"]):
        return f"{t}.SA"
    return t


# ─── Monte Carlo GBM vetorizado ──────────────────────────────────────────────

def run_monte_carlo(session, fetch_prices, days: int = 252, simulations: int = 1000) -> dict:
    from database.models import Position
    logging.info("🎲 Monte Carlo GBM vetorizado...")

    positions = (
        session.query(Position)
        .filter(Position.quantity > 0)
        .all()
    )

    tickers, weights, total_value = [], [], 0.0
    for pos in positions:
        if not pos.asset:
            continue
        cat = pos.asset.category.name if pos.asset.category else ""
        if cat in ["Renda Fixa", "Reserva"]:
            continue
        mdata = pos.asset.market_data[0] if pos.asset.market_data else None
        price = float(mdata.price or 0) if mdata else float(pos.average_price or 0)
        val = float(pos.quantity) * price
        if val <= 0:
            continue
        ticker_yf = _to_yf_ticker(pos.asset.ticker, cat)
        tickers.append(ticker_yf)
        weights.append(val)
        total_value += val

    if not tickers or total_value == 0:
        return {"status": "Erro", "msg": "Carteira vazia ou sem renda variável."}

    ticker_map = dict(zip(tickers, weights))
    data = fetch_prices(tickers, period="1y")

    close_prices = pd.DataFrame()
    if len(tickers) == 1:
        t = tickers[0]
        close_prices[t] = data["Close"] if "Close" in data.columns else data
    else:
        for t in tickers:
            try:
                if t in data.columns:
                    close_prices[t] = data[t]["Close"]
                elif "Close" in data.columns and t in data["Close"].columns:
                    close_prices[t] = data["Close"][t]
            except Exception:
                pass

    close_prices = close_prices.dropna(how="all", axis=1)
    valid = [c for c in close_prices.columns if close_prices[c].count() >= 60]
    close_prices = close_prices[valid].ffill()

    if close_prices.empty:
        return {"status": "Erro", "msg": "Dados históricos insuficientes."}

    returns = close_prices.pct_change().clip(lower=-0.30, upper=0.30)
    mean_ret = returns.mean()
    cov = returns.cov().fillna(0.0)

    valid_tickers = returns.columns.tolist()
    w = np.array([ticker_map.get(t, 0) for t in valid_tickers])
    w_sum = w.sum()
    if w_sum == 0:
        return {"status": "Erro", "msg": "Dados insuficientes."}
    w /= w_sum

    port_ret = float(np.sum(mean_ret * w))
    port_vol = float(np.sqrt(np.dot(w.T, np.dot(cov, w))))
    port_vol = min(port_vol, 1.50 / np.sqrt(days))
    drift = port_ret - 0.5 * port_vol ** 2

    shocks = np.random.normal(loc=drift, scale=port_vol, size=(simulations, days))
    paths = total_value * np.exp(np.cumsum(shocks, axis=1))

    vol_ann = port_vol * np.sqrt(days)
    logging.info(f"✅ Monte Carlo concluído. Volatilidade anualizada: {vol_ann*100:.2f}%")
    return {
        "status": "Sucesso",
        "volatilidade_anual": f"{vol_ann*100:.2f}%",
        "projecao": {
            "pior_caso":   np.quantile(paths, 0.05, axis=0).tolist(),
            "medio":       np.median(paths, axis=0).tolist(),
            "melhor_caso": np.quantile(paths, 0.95, axis=0).tolist(),
        },
    }


# ─── Risk Metrics ────────────────────────────────────────────────────────────

def calculate_risk_metrics(session, fetch_prices) -> dict:
    from database.models import Position
    logging.info("📐 Calculando métricas de risco...")

    positions = session.query(Position).filter(Position.quantity > 0).all()
    tickers_yf, weights_val, total_value = [], [], 0.0

    for pos in positions:
        if not pos.asset or not pos.asset.market_data:
            continue
        cat = pos.asset.category.name if pos.asset.category else ""
        if cat in ["Renda Fixa", "Reserva"]:
            continue
        price = float(pos.asset.market_data[0].price or 0)
        val = float(pos.quantity) * price
        if val <= 0:
            continue
        ticker_yf = _to_yf_ticker(pos.asset.ticker, cat)
        tickers_yf.append(ticker_yf)
        weights_val.append(val)
        total_value += val

    if not tickers_yf:
        return {"status": "Erro", "msg": "Sem ativos de renda variável."}

    BENCHMARK = "^BVSP"
    RISK_FREE = get_risk_free_rate()
    rf_daily = RISK_FREE / 252

    raw = fetch_prices(list(set(tickers_yf)) + [BENCHMARK], period="1y")
    prices = (
        raw.xs("Close", axis=1, level=1)
        if isinstance(raw.columns, pd.MultiIndex)
        else (raw["Close"] if "Close" in raw.columns else raw)
    )
    prices = prices.dropna(axis=1, how="all").ffill()
    prices = prices[[c for c in prices.columns if prices[c].count() >= 30]]

    if BENCHMARK not in prices.columns:
        return {"status": "Erro", "msg": "IBOVESPA indisponível."}

    log_ret = np.log(prices / prices.shift(1)).dropna()
    bench = log_ret[BENCHMARK]
    avail = [t for t in tickers_yf if t in log_ret.columns]
    if not avail:
        return {"status": "Erro", "msg": "Histórico insuficiente."}

    av = np.array([weights_val[tickers_yf.index(t)] for t in avail])
    w = av / av.sum()
    port = log_ret[avail].dot(w)

    aligned = pd.concat([port, bench], axis=1).dropna()
    aligned.columns = ["portfolio", "benchmark"]
    p, b = aligned["portfolio"], aligned["benchmark"]
    n = len(p)
    if n < 30:
        return {"status": "Erro", "msg": f"Apenas {n} pregões comuns."}

    cov_m = np.cov(p, b)
    beta = float(cov_m[0, 1] / cov_m[1, 1]) if cov_m[1, 1] != 0 else 1.0
    ann_p = float(p.mean() * 252)
    ann_b = float(b.mean() * 252)
    ann_v = float(p.std() * np.sqrt(252))
    alpha = ann_p - (RISK_FREE + beta * (ann_b - RISK_FREE))
    sharpe = (ann_p - RISK_FREE) / ann_v if ann_v > 0 else 0.0
    dn = p[p < rf_daily]
    dv = float(dn.std() * np.sqrt(252)) if len(dn) > 5 else ann_v
    sortino = (ann_p - RISK_FREE) / dv if dv > 0 else 0.0
    cum = (1 + p).cumprod()
    dd_series = (cum - cum.cummax()) / cum.cummax()
    mdd = float(dd_series.min())
    calmar = ann_p / abs(mdd) if mdd != 0 else 0.0
    dd_chart = [{"date": str(i.date()), "drawdown": round(float(v) * 100, 2)} for i, v in dd_series.items()]

    def _beta_txt(x):
        if x > 1.25: return "Agressivo"
        if x > 1.0:  return "Moderado-agressivo"
        if x > 0.75: return "Moderado"
        return "Defensivo"

    def _sharpe_txt(x):
        if x > 2.0: return "Excepcional"
        if x > 1.5: return "Excelente"
        if x > 1.0: return "Muito bom"
        if x > 0.5: return "Bom"
        if x > 0.0: return "Aceitável"
        return "Fraco"

    return {
        "status": "Sucesso",
        "benchmark": "IBOVESPA (^BVSP)",
        "periodo": "12 meses",
        "n_pregoes": n,
        "taxa_livre_risco_pct": round(RISK_FREE * 100, 1),
        "beta": round(beta, 3),
        "alpha_anual_pct": round(alpha * 100, 2),
        "sharpe_12m": round(sharpe, 3),
        "sortino_12m": round(sortino, 3),
        "calmar_ratio": round(calmar, 3),
        "retorno_anual_pct": round(ann_p * 100, 2),
        "retorno_benchmark_pct": round(ann_b * 100, 2),
        "volatilidade_anual_pct": round(ann_v * 100, 2),
        "max_drawdown_pct": round(mdd * 100, 2),
        "drawdown_chart": dd_chart,
        "interpretacao": {
            "beta": _beta_txt(beta),
            "sharpe": _sharpe_txt(sharpe),
            "drawdown": f"Maior queda de {abs(mdd*100):.1f}% pico-a-vale",
            "alpha": f"{'Gerou' if alpha > 0 else 'Destruiu'} {abs(alpha*100):.2f}% vs. IBOV",
        },
    }


# ─── Matriz de Correlação ────────────────────────────────────────────────────

def get_correlation_matrix(session, fetch_prices) -> dict:
    from database.models import Position
    logging.info("🧮 Calculando matriz de correlação...")

    positions = session.query(Position).filter(Position.quantity > 0).all()
    tickers_map, download_list = {}, []

    for pos in positions:
        if not pos.asset:
            continue
        cat = pos.asset.category.name if pos.asset.category else ""
        if cat in ["Reserva", "Renda Fixa"]:
            continue
        t_clean = pos.asset.ticker.strip().upper()
        t_yf = _to_yf_ticker(t_clean, cat)
        tickers_map[t_yf] = t_clean
        download_list.append(t_yf)

    unique = list(set(download_list))
    if len(unique) < 2:
        return {"status": "Erro", "msg": "Mínimo 2 ativos de renda variável."}

    raw = fetch_prices(unique, period="1y")
    if isinstance(raw.columns, pd.MultiIndex):
        lv = raw.columns.get_level_values(1)
        prices = raw.xs("Close", axis=1, level=1 if "Close" in lv else 0)
    else:
        prices = raw[["Close"]] if "Close" in raw.columns else raw

    prices = prices.dropna(axis=1, how="all")
    prices = prices[[c for c in prices.columns if prices[c].count() >= 30]]
    if prices.shape[1] < 2:
        return {"status": "Erro", "msg": "Dados insuficientes para correlação."}

    ret = prices.pct_change().dropna()
    if ret.shape[0] < 30:
        return {"status": "Erro", "msg": f"Apenas {ret.shape[0]} pregões comuns."}

    corr = ret.corr()
    labels = [tickers_map.get(t, t) for t in corr.columns]
    matrix = []
    for i, ri in enumerate(corr.index):
        for j, ci in enumerate(corr.columns):
            v = corr.iloc[i, j]
            if pd.isna(v) or np.isinf(v):
                v = 0
            matrix.append({
                "x": tickers_map.get(ri, ri),
                "y": tickers_map.get(ci, ci),
                "value": round(float(v), 2),
            })

    return {"status": "Sucesso", "labels": labels, "matrix": matrix}


# ─── Smart Rebalance ─────────────────────────────────────────────────────────

def calculate_smart_rebalance(session, fetch_prices, monthly_contribution: float = 0.0) -> dict:
    from database.models import Position
    logging.info(f"⚖️ Smart Rebalance (aporte R$ {monthly_contribution:.2f})...")

    positions = session.query(Position).filter(Position.quantity > 0).all()
    if not positions:
        return {"status": "Erro", "msg": "Carteira sem posições."}

    portfolio_total = 0.0
    assets_data = []
    for pos in positions:
        if not pos.asset or not pos.asset.market_data:
            continue
        mdata = pos.asset.market_data[0]
        price = float(mdata.price or pos.average_price or 0)
        if price <= 0:
            continue
        val = float(pos.quantity) * price
        cat = pos.asset.category
        target_pct = float(cat.target_percent or 0) / 100.0 if cat else 0.0
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
            closes = closes.ffill().dropna(how="all", axis=1)
            if closes.shape[1] >= 2:
                ret = closes.pct_change().dropna()
                cm = ret.corr()
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
        lot_size = 100 if cat == "Ação" else (0 if cat == "Cripto" else 1)
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

    suggestions.sort(key=lambda x: x.get("score", 0), reverse=True)
    return {
        "status": "Sucesso",
        "total_atual": round(portfolio_total, 2),
        "aporte_mensal": round(monthly_contribution, 2),
        "total_apos_aporte": round(total_after, 2),
        "sugestoes": suggestions,
    }


# ─── Projeção de IF ──────────────────────────────────────────────────────────

def calculate_income_projection(
    session,
    monthly_contribution: float = 1000.0,
    years: int = 20,
    annual_return_pct: float = 12.0,
    annual_dividend_yield_pct: float = 6.0,
) -> dict:
    from database.models import Position
    logging.info(f"📊 Projetando IF: R${monthly_contribution}/mês, {years}a, {annual_return_pct}% a.a.")

    positions = session.query(Position).filter(Position.quantity > 0).all()
    current_portfolio = 0.0
    current_income = 0.0
    for pos in positions:
        if not pos.asset or not pos.asset.market_data:
            continue
        mdata = pos.asset.market_data[0]
        price = float(mdata.price or pos.average_price or 0)
        val = float(pos.quantity) * price
        current_portfolio += val
        if pos.manual_dy and pos.manual_dy > 0:
            current_income += val * pos.manual_dy / 12

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
