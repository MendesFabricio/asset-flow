# server/domain/quant/risk.py
import logging
import numpy as np
import json
from datetime import datetime, timedelta
from database.models import Position, SystemCache, safe_commit
from domain.quant.helpers import _to_yf_ticker, _align_prices_to_b3, get_risk_free_rate

def _get_current_user_id():
    try:
        from flask import has_request_context, g
        if has_request_context() and hasattr(g, 'user_id'):
            return g.user_id
    except Exception:
        pass
    return 1

def calculate_risk_metrics(session, fetch_prices) -> dict:
    uid = _get_current_user_id()
    cache_key = f"risk_metrics_{uid}" if uid is not None else "risk_metrics"
    try:
        cache_record = session.query(SystemCache).filter_by(key=cache_key).first()
        if cache_record:
            age = datetime.now() - cache_record.updated_at
            if age < timedelta(hours=1):
                logging.info("📐 Retornando métricas de risco do Cache...")
                return json.loads(cache_record.value)
    except Exception as e:
        logging.warning(f"⚠️ Erro ao ler cache de métricas de risco: {e}")

    logging.info("📐 Calculando métricas de risco...")
    import pandas as pd

    query = session.query(Position)
    if uid is not None:
        positions = query.filter(Position.user_id == uid, Position.quantity > 0).all()
    else:
        positions = query.filter(Position.quantity > 0).all()
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
    prices = _align_prices_to_b3(prices)
    prices = prices[[c for c in prices.columns if prices[c].count() >= 30]]

    for col in prices.columns:
        if col == BENCHMARK:
            continue
        vals = prices[col].tolist()
        for idx in range(1, len(vals)):
            prev = vals[idx - 1]
            curr = vals[idx]
            if prev is None or pd.isna(prev) or prev <= 0 or curr is None or pd.isna(curr):
                continue
            ratio = curr / prev
            if ratio < 0.5 or ratio > 2.0:
                vals[idx] = prev
        prices[col] = vals

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

    aligned = pd.concat([port, bench], axis=1)
    aligned.columns = ["portfolio", "benchmark"]
    aligned = aligned.ffill().bfill().dropna()
    p, b = aligned["portfolio"], aligned["benchmark"]
    n = len(p)
    if n < 30:
        return {"status": "Erro", "msg": f"Apenas {n} pregões comuns."}

    decay_factor = 0.94
    alpha_ewma = 1.0 - decay_factor

    ewma_mean = aligned.ewm(alpha=alpha_ewma).mean().iloc[-1]
    ann_p = float(ewma_mean["portfolio"] * 252)
    ann_b = float(ewma_mean["benchmark"] * 252)

    ewma_cov = aligned.ewm(alpha=alpha_ewma).cov().xs(aligned.index[-1])
    cov_portfolio_bench = float(ewma_cov.loc["portfolio", "benchmark"])
    var_bench = float(ewma_cov.loc["benchmark", "benchmark"])
    var_portfolio = float(ewma_cov.loc["portfolio", "portfolio"])

    beta = cov_portfolio_bench / var_bench if var_bench > 0 else 1.0
    ann_v = float(np.sqrt(var_portfolio) * np.sqrt(252))
    alpha = ann_p - (RISK_FREE + beta * (ann_b - RISK_FREE))
    sharpe = (ann_p - RISK_FREE) / ann_v if ann_v > 0 else 0.0

    dn = p[p < rf_daily]
    if len(dn) > 5:
        dn_var = dn.ewm(alpha=alpha_ewma).var().iloc[-1]
        if np.isnan(dn_var) or np.isinf(dn_var) or dn_var <= 0:
            dv = ann_v
        else:
            dv = float(np.sqrt(dn_var) * np.sqrt(252))
    else:
        dv = ann_v
    sortino = (ann_p - RISK_FREE) / dv if dv > 0 else 0.0

    cum = np.exp(p.cumsum())
    dd_series = (cum - cum.cummax()) / cum.cummax()
    mdd = float(dd_series.min())
    calmar = ann_p / abs(mdd) if mdd != 0 else 0.0
    dd_chart = [{"date": str(i.date()), "drawdown": round(float(v) * 100, 2)} for i, v in dd_series.items()]

    z = -1.6448536269514722
    S = float(p.skew())
    K = float(p.kurt())
    if np.isnan(S) or np.isinf(S):
        S = 0.0
    if np.isnan(K) or np.isinf(K):
        K = 0.0

    Z_cf = z + (S / 6.0) * (z**2 - 1.0) + (K / 24.0) * (z**3 - 3.0*z) - (S**2 / 36.0) * (2.0*z**3 - 5.0*z)

    mu_ewma = float(ewma_mean["portfolio"])
    sigma_ewma = float(np.sqrt(var_portfolio))
    var_95_daily = mu_ewma + Z_cf * sigma_ewma
    var_95_monthly = var_95_daily * np.sqrt(21)
    
    var_95_daily_pct = round(abs(var_95_daily) * 100, 2)
    var_95_monthly_pct = round(abs(var_95_monthly) * 100, 2)

    worst_returns = p[p <= var_95_daily]
    cvar_95_daily = float(worst_returns.mean()) if len(worst_returns) > 0 else var_95_daily
    cvar_95_monthly = cvar_95_daily * np.sqrt(21)
    cvar_95_daily_pct = round(abs(cvar_95_daily) * 100, 2)
    cvar_95_monthly_pct = round(abs(cvar_95_monthly) * 100, 2)

    excess_returns = p - b
    tracking_error_var = excess_returns.ewm(alpha=alpha_ewma).var().iloc[-1]
    tracking_error = float(np.sqrt(tracking_error_var) * np.sqrt(252))
    tracking_error_pct = round(tracking_error * 100, 2)

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

    sectors_alloc = {}
    total_assets_value = 0.0
    
    for pos in positions:
        if not pos.asset:
            continue
        cat = pos.asset.category.name if pos.asset.category else ""
        price = float(pos.asset.market_data[0].price or 0) if pos.asset.market_data else float(pos.average_price or 0)
        val = float(pos.quantity) * price
        if val <= 0:
            continue
            
        total_assets_value += val
        ticker = pos.asset.ticker.upper().strip()
        
        sector = "Outros"
        if cat in ["Renda Fixa", "Reserva"]:
            sector = "Reserva & Renda Fixa"
        elif cat == "Cripto" or any(x in ticker for x in ["BTC", "ETH", "SOL"]):
            sector = "Tecnologia & Cripto"
        else:
            if any(x in ticker for x in ["ITUB", "BBDC", "BBAS", "SANB", "ITSA", "BPAC", "BBPO", "BBRC", "KNCR", "HGCR", "MXRF"]):
                sector = "Financeiro"
            elif any(x in ticker for x in ["EGIE", "EQTL", "CPLE", "TAEE", "TRPL", "ENGI", "CPFE", "ELET", "CMIG", "ALUP"]):
                sector = "Utilidades / Energia"
            elif any(x in ticker for x in ["PETR", "PRIO", "RECV", "ENAT", "RRRP", "CSAN", "VALE", "CSNA", "USIM", "GGBR"]):
                sector = "Commodities & Materiais"
            elif any(x in ticker for x in ["AAPL", "MSFT", "GOOG", "META", "AMZN", "NVDA", "TSLA", "TOTS", "WEGE"]):
                sector = "Tecnologia & Inovação"
            elif any(x in ticker for x in ["HGBS", "VISC", "HGLG", "BTLG", "XPLG", "HGRE", "BRCO", "KNIP", "CPTS"]):
                sector = "Imobiliário"
            elif any(x in ticker for x in ["LREN", "MGLU", "SMTO", "SLCE", "BEEF", "JBSS", "MRFG", "ABEV"]):
                sector = "Consumo & Agronegócio"
            else:
                if cat == "FII":
                    sector = "Imobiliário"
                else:
                    sector = "Outros / Diversificados"
                    
        sectors_alloc[sector] = sectors_alloc.get(sector, 0.0) + val

    sectors_list = []
    if total_assets_value > 0:
        for sec, s_val in sectors_alloc.items():
            sectors_list.append({
                "sector": sec,
                "value": round(s_val, 2),
                "percent": round((s_val / total_assets_value) * 100, 2)
            })
        sectors_list.sort(key=lambda x: x["percent"], reverse=True)

    leveraged_assets = []
    leverage_factors = {
        "UPRO": 3.0, "TQQQ": 3.0, "SSO": 2.0, "QLD": 2.0, "BOVA11": 1.0, "IVVB11": 1.0
    }
    total_leverage_value = 0.0
    
    for pos in positions:
        if not pos.asset:
            continue
        cat = pos.asset.category.name if pos.asset.category else ""
        price = float(pos.asset.market_data[0].price or 0) if pos.asset.market_data else float(pos.average_price or 0)
        val = float(pos.quantity) * price
        if val <= 0:
            continue
            
        ticker = pos.asset.ticker.upper().strip()
        factor = 1.0
        for key, fac in leverage_factors.items():
            if key in ticker:
                factor = fac
                break
                
        total_leverage_value += val * factor
        if factor > 1.0:
            leveraged_assets.append({
                "ticker": pos.asset.ticker,
                "leverage": factor,
                "value": round(val, 2)
            })
            
    weighted_leverage = round(total_leverage_value / total_assets_value, 2) if total_assets_value > 0 else 1.0

    usd_value = 0.0
    for pos in positions:
        if not pos.asset:
            continue
        cat = pos.asset.category.name if pos.asset.category else ""
        price = float(pos.asset.market_data[0].price or 0) if pos.asset.market_data else float(pos.average_price or 0)
        val = float(pos.quantity) * price
        if val <= 0:
            continue
            
        ticker = pos.asset.ticker.upper().strip()
        if pos.asset.currency == "USD" or cat in ["Internacional", "Cripto"] or any(x in ticker for x in ["IVVB11", "EUR", "USD", "BTC", "ETH"]):
            usd_value += val
            
    usd_percent = round((usd_value / total_assets_value) * 100, 2) if total_assets_value > 0 else 0.0
    
    if usd_percent > 30.0:
        suggested_hedge = f"Exposição cambial alta ({usd_percent}%). Sugere-se comprar opções de Put de IVVB11 ou contratos futuros de dólar (WDO) na proporção de {round(usd_percent * 0.4, 1)}% do total."
    elif usd_percent > 10.0:
        suggested_hedge = f"Exposição cambial saudável ({usd_percent}%). Atua como diversificação e hedge inflacionário passivo."
    else:
        suggested_hedge = "Exposição cambial baixa. Não é recomendável hedge cambial estruturado no momento."

    aligned_copy = aligned.copy()
    aligned_copy.index = pd.to_datetime(aligned_copy.index)
    try:
        monthly = aligned_copy.resample('ME').sum().apply(np.exp) - 1.0
    except ValueError:
        monthly = aligned_copy.resample('M').sum().apply(np.exp) - 1.0
    
    m_p = monthly["portfolio"]
    m_b = monthly["benchmark"]
    
    up_mask = m_b > 0
    down_mask = m_b < 0
    
    upside_capture = 100.0
    downside_capture = 100.0
    
    if up_mask.any():
        mean_p_up = m_p[up_mask].mean()
        mean_b_up = m_b[up_mask].mean()
        if mean_b_up != 0:
            upside_capture = round((mean_p_up / mean_b_up) * 100, 1)
            
    if down_mask.any():
        mean_p_down = m_p[down_mask].mean()
        mean_b_down = m_b[down_mask].mean()
        if mean_b_down != 0:
            downside_capture = round((mean_p_down / mean_b_down) * 100, 1)

    fii_credit_map = []
    fii_risk_db = {
        "KNCR11": {"rating": "AAA (High)", "duration_years": 2.2, "indexers": {"CDI": 95, "IPCA": 5}},
        "KNIP11": {"rating": "AA+ (High-Medium)", "duration_years": 4.8, "indexers": {"IPCA": 98, "CDI": 2}},
        "CPTS11": {"rating": "AA (Medium)", "duration_years": 5.5, "indexers": {"IPCA": 90, "CDI": 10}},
        "MXRF11": {"rating": "A+ (Medium-Low)", "duration_years": 3.9, "indexers": {"IPCA": 55, "CDI": 45}},
        "HGCR11": {"rating": "AA (Medium)", "duration_years": 3.2, "indexers": {"CDI": 60, "IPCA": 40}}
    }
    
    for pos in positions:
        if not pos.asset or pos.asset.category.name != "FII":
            continue
        ticker = pos.asset.ticker.upper().strip()
        if ticker in fii_risk_db:
            fii_credit_map.append({
                "ticker": ticker,
                "rating": fii_risk_db[ticker]["rating"],
                "duration": fii_risk_db[ticker]["duration_years"],
                "indexers": fii_risk_db[ticker]["indexers"]
            })

    result = {
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
        "var_95_daily_pct": var_95_daily_pct,
        "var_95_monthly_pct": var_95_monthly_pct,
        "cvar_95_daily_pct": cvar_95_daily_pct,
        "cvar_95_monthly_pct": cvar_95_monthly_pct,
        "tracking_error_pct": tracking_error_pct,
        "var_text": f"Com 95% de confiança, a perda máxima esperada para esta carteira em 24h é de {var_95_daily_pct}%.",
        "drawdown_chart": dd_chart,
        "sectors_alloc": sectors_list,
        "leverage_ratio": weighted_leverage,
        "leveraged_assets": leveraged_assets,
        "usd_exposure_pct": usd_percent,
        "usd_hedge_suggestion": suggested_hedge,
        "upside_capture_pct": upside_capture,
        "downside_capture_pct": downside_capture,
        "fii_credit_map": fii_credit_map,
        "interpretacao": {
            "beta": _beta_txt(beta),
            "sharpe": _sharpe_txt(sharpe),
            "drawdown": f"Maior queda de {abs(mdd*100):.1f}% pico-a-vale",
            "alpha": f"{'Gerou' if alpha > 0 else 'Destruiu'} {abs(alpha*100):.2f}% vs. IBOV",
        },
    }

    try:
        cache_record = session.query(SystemCache).filter_by(key=cache_key).first()
        if not cache_record:
            cache_record = SystemCache(key=cache_key)
            session.add(cache_record)
        cache_record.value = json.dumps(result)
        cache_record.updated_at = datetime.now()
        safe_commit(session)
    except Exception as e:
        logging.warning(f"⚠️ Erro ao salvar cache de métricas de risco: {e}")

    return result
