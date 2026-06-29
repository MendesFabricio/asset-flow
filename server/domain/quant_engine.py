"""
domain/quant_engine.py
Motor quantitativo isolado: Monte Carlo GBM, Risk Metrics,
Correlação, Smart Rebalance, Projeção de IF.

Recebe `session` e `fetch_prices` por injeção de dependência
para evitar import circular com services.py.
"""
import logging
import numpy as np
from datetime import datetime
import time
import requests
import threading
import pandas_market_calendars as mcal

def _align_prices_to_b3(prices):
    import pandas as pd
    """
    Alinha o index do DataFrame de preços aos dias úteis oficiais da B3 (calendário BMF),
    evitando que feriados internacionais ou diferenças de pregão provoquem desvios nas
    matrizes de covariância/correlação.
    """
    if prices.empty:
        return prices
    try:
        # Garante que o index seja DatetimeIndex, remove timezone e normaliza para meia-noite
        prices.index = pd.to_datetime(prices.index).tz_localize(None).normalize()
        
        # Localiza início e fim dos dados
        start_date = prices.index.min()
        end_date = prices.index.max()
        
        b3_cal = mcal.get_calendar('BMF')
        valid_days = b3_cal.schedule(start_date=start_date, end_date=end_date)
        if valid_days.empty:
            return prices.ffill().bfill()
        trading_days = mcal.date_range(valid_days, frequency='1D')
        
        # Remove timezones e normaliza trading_days para meia-noite
        trading_days = trading_days.tz_localize(None).normalize()
        
        # Reindexa e preenche valores faltantes
        prices = prices.reindex(trading_days).ffill().bfill()
    except Exception as e:
        logging.warning(f"⚠️ Erro ao alinhar calendários de trading da B3: {e}")
        prices = prices.ffill().bfill()
    return prices


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
    import pandas as pd

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
    close_prices = close_prices[valid]
    close_prices = _align_prices_to_b3(close_prices)

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
    
    # Anualiza retorno e volatilidade para o cálculo correto dos parâmetros GBM
    port_ret_ann = port_ret * 252
    port_vol_ann = port_vol * np.sqrt(252)
    
    # 🛡️ Proteção quantitativa: ignora cap artificial se houver Cripto na carteira
    has_crypto = any(
        (pos.asset.category.name if pos.asset.category else "") in ["Cripto", "Criptomoeda"]
        for pos in positions if pos.asset
    )
    if not has_crypto:
        port_vol_ann = min(port_vol_ann, 1.50)
        
    dt = 1.0 / days
    lambda_jump = 0.5    # Média de 0.5 quedas/saltos por ano
    mu_jump = -0.10      # Queda média de 10% no salto
    sigma_jump = 0.15    # Dispersão do salto de 15%
    
    kappa = np.exp(mu_jump + 0.5 * sigma_jump ** 2) - 1
    # Cálculo do drift anualizado do modelo de Merton
    drift_ann = port_ret_ann - lambda_jump * kappa - 0.5 * port_vol_ann ** 2
    
    # Choque normal GBM: loc = drift_ann * dt, scale = port_vol_ann * np.sqrt(dt)
    shocks = np.random.normal(loc=drift_ann * dt, scale=port_vol_ann * np.sqrt(dt), size=(simulations, days))
    
    # Choques de Salto Merton (Poisson + Normal)
    poi_lam = lambda_jump * dt
    jump_counts = np.random.poisson(lam=poi_lam, size=(simulations, days))
    jump_shocks = jump_counts * mu_jump + np.sqrt(jump_counts) * sigma_jump * np.random.normal(size=(simulations, days))
    
    # Caminhos projetados acumulados
    paths = total_value * np.exp(np.cumsum(shocks + jump_shocks, axis=1))

    logging.info(f"✅ Monte Carlo concluído. Volatilidade anualizada: {port_vol_ann*100:.2f}%")
    return {
        "status": "Sucesso",
        "volatilidade_anual": f"{port_vol_ann*100:.2f}%",
        "projecao": {
            "pior_caso":   np.quantile(paths, 0.05, axis=0).tolist(),
            "medio":       np.median(paths, axis=0).tolist(),
            "melhor_caso": np.quantile(paths, 0.95, axis=0).tolist(),
        },
    }


# ─── Risk Metrics ────────────────────────────────────────────────────────────

def calculate_risk_metrics(session, fetch_prices) -> dict:
    from database.models import Position, SystemCache, safe_commit
    import json
    from datetime import datetime, timedelta
    
    # 📐 Retorna cache se estiver válido (expiração de 1 hora)
    try:
        cache_record = session.query(SystemCache).filter_by(key="risk_metrics").first()
        if cache_record:
            age = datetime.now() - cache_record.updated_at
            if age < timedelta(hours=1):
                logging.info("📐 Retornando métricas de risco do Cache...")
                return json.loads(cache_record.value)
    except Exception as e:
        logging.warning(f"⚠️ Erro ao ler cache de métricas de risco: {e}")

    logging.info("📐 Calculando métricas de risco...")
    import pandas as pd

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
    # Alinhamento temporal com preenchimento para frente e para trás
    prices = _align_prices_to_b3(prices)
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

    aligned = pd.concat([port, bench], axis=1)
    aligned.columns = ["portfolio", "benchmark"]
    aligned = aligned.ffill().bfill().dropna()
    p, b = aligned["portfolio"], aligned["benchmark"]
    n = len(p)
    if n < 30:
        return {"status": "Erro", "msg": f"Apenas {n} pregões comuns."}

    # Parâmetros EWMA (lambda = 0.94, alpha = 0.06)
    decay_factor = 0.94
    alpha_ewma = 1.0 - decay_factor

    # Médias dos retornos EWMA (anualizadas)
    ewma_mean = aligned.ewm(alpha=alpha_ewma).mean().iloc[-1]
    ann_p = float(ewma_mean["portfolio"] * 252)
    ann_b = float(ewma_mean["benchmark"] * 252)

    # Covariância e variância EWMA
    ewma_cov = aligned.ewm(alpha=alpha_ewma).cov().xs(aligned.index[-1])
    cov_portfolio_bench = float(ewma_cov.loc["portfolio", "benchmark"])
    var_bench = float(ewma_cov.loc["benchmark", "benchmark"])
    var_portfolio = float(ewma_cov.loc["portfolio", "portfolio"])

    # Beta dinâmico EWMA
    beta = cov_portfolio_bench / var_bench if var_bench > 0 else 1.0

    # Volatilidade EWMA anualizada
    ann_v = float(np.sqrt(var_portfolio) * np.sqrt(252))

    # Alpha EWMA
    alpha = ann_p - (RISK_FREE + beta * (ann_b - RISK_FREE))

    # Sharpe EWMA
    sharpe = (ann_p - RISK_FREE) / ann_v if ann_v > 0 else 0.0

    # Sortino EWMA (volatilidade de downside EWMA)
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

    cum = (1 + p).cumprod()
    dd_series = (cum - cum.cummax()) / cum.cummax()
    mdd = float(dd_series.min())
    calmar = ann_p / abs(mdd) if mdd != 0 else 0.0
    dd_chart = [{"date": str(i.date()), "drawdown": round(float(v) * 100, 2)} for i, v in dd_series.items()]

    # Value at Risk (VaR) Paramétrico de Cornish-Fisher a 95%
    z = -1.6448536269514722
    S = float(p.skew())
    K = float(p.kurt())  # excess kurtosis
    if np.isnan(S) or np.isinf(S):
        S = 0.0
    if np.isnan(K) or np.isinf(K):
        K = 0.0

    # Expansão de Cornish-Fisher para quantil ajustado
    Z_cf = z + (S / 6.0) * (z**2 - 1.0) + (K / 24.0) * (z**3 - 3.0*z) - (S**2 / 36.0) * (2.0*z**3 - 5.0*z)

    # VaR diário parametrizado pelo EWMA
    mu_ewma = float(ewma_mean["portfolio"])
    sigma_ewma = float(np.sqrt(var_portfolio))
    var_95_daily = mu_ewma + Z_cf * sigma_ewma

    # VaR mensal escalado
    var_95_monthly = var_95_daily * np.sqrt(21)
    
    var_95_daily_pct = round(abs(var_95_daily) * 100, 2)
    var_95_monthly_pct = round(abs(var_95_monthly) * 100, 2)

    # Conditional Value at Risk (CVaR) baseado no VaR de Cornish-Fisher
    worst_returns = p[p <= var_95_daily]
    cvar_95_daily = float(worst_returns.mean()) if len(worst_returns) > 0 else var_95_daily
    cvar_95_monthly = cvar_95_daily * np.sqrt(21)
    cvar_95_daily_pct = round(abs(cvar_95_daily) * 100, 2)
    cvar_95_monthly_pct = round(abs(cvar_95_monthly) * 100, 2)

    # Tracking Error EWMA
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
        "interpretacao": {
            "beta": _beta_txt(beta),
            "sharpe": _sharpe_txt(sharpe),
            "drawdown": f"Maior queda de {abs(mdd*100):.1f}% pico-a-vale",
            "alpha": f"{'Gerou' if alpha > 0 else 'Destruiu'} {abs(alpha*100):.2f}% vs. IBOV",
        },
    }

    try:
        cache_record = session.query(SystemCache).filter_by(key="risk_metrics").first()
        if not cache_record:
            cache_record = SystemCache(key="risk_metrics")
            session.add(cache_record)
        cache_record.value = json.dumps(result)
        cache_record.updated_at = datetime.now()
        safe_commit(session)
    except Exception as e:
        logging.warning(f"⚠️ Erro ao salvar cache de métricas de risco: {e}")

    return result


# ─── Matriz de Correlação ────────────────────────────────────────────────────

def get_correlation_matrix(session, fetch_prices) -> dict:
    from database.models import Position
    logging.info("🧮 Calculando matriz de correlação...")
    import pandas as pd

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
    prices = _align_prices_to_b3(prices)
    prices = prices[[c for c in prices.columns if prices[c].count() >= 30]]
    if prices.shape[1] < 2:
        return {"status": "Erro", "msg": "Dados insuficientes para correlação."}

    ret = prices.pct_change().dropna()
    if ret.shape[0] < 30:
        return {"status": "Erro", "msg": f"Apenas {ret.shape[0]} pregões comuns."}

    # Correlação EWMA (lambda = 0.94, alpha = 0.06)
    decay_factor = 0.94
    alpha_ewma = 1.0 - decay_factor
    ewma_corr_df = ret.ewm(alpha=alpha_ewma).corr()
    corr = ewma_corr_df.xs(ret.index[-1]).fillna(0.0)

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
    import pandas as pd

    positions = session.query(Position).filter(Position.quantity > 0).all()
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
                # Correlação EWMA (lambda = 0.94, alpha = 0.06)
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

    # Filtra as sugestões para omitir aquelas cujo valor sugerido de compra é igual a zero (ou MANTER)
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
        if not pos.asset:
            continue
        mdata = pos.asset.market_data[0] if pos.asset.market_data else None
        price = float(mdata.price or pos.average_price or 0) if mdata else float(pos.average_price or 0)
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


# ─── Paridade de Risco (Risk Parity Model) ───────────────────────────────────

def calculate_risk_parity(session, fetch_prices) -> dict:
    """
    Calcula pesos ideais de Paridade de Risco (Risk Parity) baseando-se na volatilidade histórica
    e matriz de covariância. Retorna o percentual ideal de alocação de risco.
    """
    from database.models import Position
    import pandas as pd
    logging.info("⚖️ Calculando Paridade de Risco do Portfólio...")
    
    positions = session.query(Position).filter(Position.quantity > 0).all()
    tickers_yf, tickers_clean = [], []
    for pos in positions:
        if not pos.asset:
            continue
        cat = pos.asset.category.name if pos.asset.category else ""
        if cat in ["Renda Fixa", "Reserva"]:
            continue
        ticker_yf = _to_yf_ticker(pos.asset.ticker, cat)
        tickers_yf.append(ticker_yf)
        tickers_clean.append(pos.asset.ticker.upper())
        
    if len(tickers_yf) < 2:
        return {"status": "Erro", "msg": "Mínimo 2 ativos de renda variável necessários."}
        
    raw = fetch_prices(list(set(tickers_yf)), period="1y")
    prices = (
        raw.xs("Close", axis=1, level=1)
        if isinstance(raw.columns, pd.MultiIndex)
        else (raw["Close"] if "Close" in raw.columns else raw)
    )
    prices = _align_prices_to_b3(prices)
    prices = prices[[c for c in prices.columns if prices[c].count() >= 30]]
    
    if prices.shape[1] < 2:
        return {"status": "Erro", "msg": "Dados históricos insuficientes."}
        
    log_ret = np.log(prices / prices.shift(1)).dropna()
    # Covariância EWMA (lambda = 0.94, alpha = 0.06)
    decay_factor = 0.94
    alpha_ewma = 1.0 - decay_factor
    ewma_cov_df = log_ret.ewm(alpha=alpha_ewma).cov()
    cov = ewma_cov_df.xs(log_ret.index[-1]).fillna(0.0)
    
    avail_tickers = log_ret.columns.tolist()
    n = len(avail_tickers)
    
    # Algoritmo de ponto fixo para alocação de contribuição de risco idêntica (Risk Parity)
    w = np.ones(n) / n
    for _ in range(50):
        mrc = cov.dot(w)
        mrc = np.where(mrc <= 0, 1e-8, mrc)
        w = 1.0 / mrc
        w /= w.sum()
        
    ticker_clean_map = dict(zip(tickers_yf, tickers_clean))
    
    return {
        "status": "Sucesso",
        "weights": {ticker_clean_map.get(t, t): round(float(weight) * 100, 2) for t, weight in zip(avail_tickers, w)}
    }


# ─── Otimização de Markowitz ( Sharpe Máximo) ───────────────────────────────

def calculate_markowitz_optimization(session, fetch_prices) -> dict:
    """
    Sugerir pesos baseados na maximização do Sharpe Ratio sobre a Fronteira Eficiente.
    """
    from database.models import Position
    import pandas as pd
    logging.info("📈 Calculando Otimização de Markowitz ( Sharpe Máximo)...")
    
    positions = session.query(Position).filter(Position.quantity > 0).all()
    tickers_yf, tickers_clean = [], []
    for pos in positions:
        if not pos.asset:
            continue
        cat = pos.asset.category.name if pos.asset.category else ""
        if cat in ["Renda Fixa", "Reserva"]:
            continue
        ticker_yf = _to_yf_ticker(pos.asset.ticker, cat)
        tickers_yf.append(ticker_yf)
        tickers_clean.append(pos.asset.ticker.upper())
        
    if len(tickers_yf) < 2:
        return {"status": "Erro", "msg": "Mínimo 2 ativos de renda variável."}
        
    raw = fetch_prices(list(set(tickers_yf)), period="1y")
    prices = (
        raw.xs("Close", axis=1, level=1)
        if isinstance(raw.columns, pd.MultiIndex)
        else (raw["Close"] if "Close" in raw.columns else raw)
    )
    prices = _align_prices_to_b3(prices)
    prices = prices[[c for c in prices.columns if prices[c].count() >= 30]]
    
    if prices.shape[1] < 2:
        return {"status": "Erro", "msg": "Dados históricos insuficientes."}
        
    log_ret = np.log(prices / prices.shift(1)).dropna()
    # Parâmetros EWMA (lambda = 0.94, alpha = 0.06)
    decay_factor = 0.94
    alpha_ewma = 1.0 - decay_factor
    
    mean_returns = log_ret.ewm(alpha=alpha_ewma).mean().iloc[-1]
    ewma_cov_df = log_ret.ewm(alpha=alpha_ewma).cov()
    cov_matrix = ewma_cov_df.xs(log_ret.index[-1]).fillna(0.0)
    
    avail_tickers = log_ret.columns.tolist()
    N = len(avail_tickers)
    risk_free = get_risk_free_rate()
    
    # Simulações de Monte Carlo vetorizadas para encontrar o portfólio ótimo (sem for loops)
    num_portfolios = 5000
    weights_matrix = np.random.random((num_portfolios, N))
    weights_matrix = weights_matrix / np.sum(weights_matrix, axis=1, keepdims=True)
    
    p_rets = np.dot(weights_matrix, mean_returns) * 252
    cov_ann = cov_matrix.to_numpy() * 252
    p_vols = np.sqrt(np.einsum('ij,jk,ik->i', weights_matrix, cov_ann, weights_matrix))
    p_sharpes = np.where(p_vols > 0, (p_rets - risk_free) / p_vols, 0.0)
    
    max_sharpe_idx = np.argmax(p_sharpes)
    best_weights = weights_matrix[max_sharpe_idx]
    best_ret = p_rets[max_sharpe_idx]
    best_vol = p_vols[max_sharpe_idx]
    best_sharpe = p_sharpes[max_sharpe_idx]
    
    ticker_clean_map = dict(zip(tickers_yf, tickers_clean))
    
    return {
        "status": "Sucesso",
        "retorno_anual_esperado": round(float(best_ret) * 100, 2),
        "volatilidade_anual_esperada": round(float(best_vol) * 100, 2),
        "sharpe_maximo": round(float(best_sharpe), 3),
        "weights": {ticker_clean_map.get(t, t): round(float(weight) * 100, 2) for t, weight in zip(avail_tickers, best_weights)}
    }


# ─── Exposição Setorial / Fator Oculto (Treemap) ─────────────────────────────

def calculate_sector_exposure(session) -> dict:
    """
    Mapeia a distribuição setorial da carteira e emite alertas se houver concentração excessiva.
    """
    from database.models import Position
    logging.info("🌳 Calculando exposição setorial (Treemap)...")
    
    positions = session.query(Position).filter(Position.quantity > 0).all()
    sector_map = {}
    total_portfolio = 0.0
    
    for pos in positions:
        if not pos.asset:
            continue
        cat_name = pos.asset.category.name if pos.asset.category else "Outros"
        mdata = pos.asset.market_data[0] if pos.asset.market_data else None
        price = float(mdata.price or 0) if mdata else float(pos.average_price or 0)
        value = float(pos.quantity) * price
        if value <= 0:
            continue
        
        total_portfolio += value
        if cat_name not in sector_map:
            sector_map[cat_name] = {"value": 0.0, "assets": []}
        sector_map[cat_name]["value"] += value
        sector_map[cat_name]["assets"].append({
            "name": pos.asset.ticker.upper(),
            "value": round(value, 2)
        })
        
    treemap_data = []
    alerts = []
    
    for sector, data in sector_map.items():
        pct = (data["value"] / total_portfolio) * 100 if total_portfolio > 0 else 0
        if pct > 40.0 and sector not in ["Renda Fixa", "Reserva"]:
            alerts.append(f"Alerta de Concentração: {sector} representa {pct:.1f}% da carteira total (limite prudencial de 40.0% excedido).")
            
        treemap_data.append({
            "name": sector,
            "value": round(data["value"], 2),
            "percentage": round(pct, 2),
            "children": data["assets"]
        })
        
    return {
        "status": "Sucesso",
        "total_value": round(total_portfolio, 2),
        "treemap": treemap_data,
        "alerts": alerts
    }


# ─── Projeção Preditiva de Proventos ─────────────────────────────────────────

def calculate_dividend_forecast(session) -> dict:
    """
    Algoritmo preditivo baseado no calendário de datas-com para projetar proventos futuros.
    """
    from database.models import Position, Dividend
    logging.info("📅 Computando projeções preditivas de dividendos...")
    
    positions = session.query(Position).filter(Position.quantity > 0).all()
    if not positions:
        return {"status": "Sucesso", "forecast": [], "total_projected": 0.0}
        
    forecasts = []
    total_projected = 0.0
    
    for pos in positions:
        if not pos.asset:
            continue
        ticker = pos.asset.ticker.upper()
        qty = float(pos.quantity)
        
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

def calculate_sector_correlation(session, fetch_prices) -> dict:
    """
    Calcula a matriz de correlação de Pearson entre as cotações diárias dos ativos
    de renda variável da carteira, agrupados por suas respectivas categorias (setores).
    """
    from database.models import Position
    import pandas as pd
    import numpy as np
    logging.info("🧮 Calculando Matriz de Correlação Setorial...")
    
    positions = session.query(Position).filter(Position.quantity > 0).all()
    tickers_yf, tickers_clean, categories = [], [], []
    for pos in positions:
        if not pos.asset:
            continue
        cat = pos.asset.category.name if pos.asset.category else ""
        if cat in ["Renda Fixa", "Reserva"]:
            continue
        ticker_yf = _to_yf_ticker(pos.asset.ticker, cat)
        tickers_yf.append(ticker_yf)
        tickers_clean.append(pos.asset.ticker.upper())
        categories.append(cat)
        
    if len(tickers_yf) < 2:
        return {
            "status": "Sucesso",
            "tickers": tickers_clean,
            "categories": categories,
            "matrix": [[1.0] * len(tickers_clean) for _ in tickers_clean]
        }
        
    raw = fetch_prices(list(set(tickers_yf)), period="1y")
    prices = (
        raw.xs("Close", axis=1, level=1)
        if isinstance(raw.columns, pd.MultiIndex)
        else (raw["Close"] if "Close" in raw.columns else raw)
    )
    prices = _align_prices_to_b3(prices)
    prices = prices[[c for c in prices.columns if prices[c].count() >= 30]]
    
    if prices.shape[1] < 2:
        return {
            "status": "Sucesso",
            "tickers": tickers_clean,
            "categories": categories,
            "matrix": [[1.0] * len(tickers_clean) for _ in tickers_clean]
        }
        
    returns = prices.pct_change().dropna(how="all")
    # Correlação EWMA (lambda = 0.94, alpha = 0.06)
    decay_factor = 0.94
    alpha_ewma = 1.0 - decay_factor
    ewma_corr_df = returns.ewm(alpha=alpha_ewma).corr()
    corr_matrix = ewma_corr_df.xs(returns.index[-1]).fillna(0.0)
    
    # Ordenar por categoria/setor para criar agrupamentos visuais bonitos no heatmap
    sorted_assets = sorted(zip(tickers_yf, tickers_clean, categories), key=lambda x: x[2])
    
    final_tickers = []
    final_categories = []
    
    # Coleta apenas os ativos que sobreviveram aos filtros de dados históricos
    for yf_tick, clean_tick, cat in sorted_assets:
        if yf_tick in corr_matrix.columns:
            final_tickers.append(clean_tick)
            final_categories.append(cat)
            
    n = len(final_tickers)
    matrix_data = []
    for t_row in sorted_assets:
        row_yf = t_row[0]
        if row_yf not in corr_matrix.columns:
            continue
        row_values = []
        for t_col in sorted_assets:
            col_yf = t_col[0]
            if col_yf not in corr_matrix.columns:
                continue
            corr_val = float(corr_matrix.loc[row_yf, col_yf])
            row_values.append(round(corr_val, 4))
        matrix_data.append(row_values)
        
    return {
        "status": "Sucesso",
        "tickers": final_tickers,
        "categories": final_categories,
        "matrix": matrix_data
    }
