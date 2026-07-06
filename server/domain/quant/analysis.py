# server/domain/quant/analysis.py
import numpy as np
import pandas as pd
from database.models import Position
from domain.quant.helpers import _to_yf_ticker, _align_prices_to_b3, get_risk_free_rate

def _get_current_user_id():
    try:
        from flask import has_request_context, g
        if has_request_context() and hasattr(g, 'user_id'):
            return g.user_id
    except Exception:
        pass
    return None

def calculate_kelly_criterion(session, fetch_prices) -> dict:
    uid = _get_current_user_id()
    query = session.query(Position)
    if uid is not None:
        query = query.filter_by(user_id=uid)
    positions = query.filter(Position.quantity > 0).all()
    tickers_yf, tickers_clean, categories = [], [], []
    for pos in positions:
        if not pos.asset:
            continue
        cat = pos.asset.category.name if pos.asset.category else ""
        if cat in ["Renda Fixa", "Reserva"]:
            continue
        tickers_yf.append(_to_yf_ticker(pos.asset.ticker, cat))
        tickers_clean.append(pos.asset.ticker.upper())
        categories.append(cat)
        
    if not tickers_yf:
        return {"status": "Erro", "msg": "Sem ativos de renda variável ativos na carteira."}
        
    raw = fetch_prices(list(set(tickers_yf)), period="1y")
    prices = (
        raw.xs("Close", axis=1, level=1)
        if isinstance(raw.columns, pd.MultiIndex)
        else (raw["Close"] if "Close" in raw.columns else raw)
    )
    prices = _align_prices_to_b3(prices)
    prices = prices[[c for c in prices.columns if prices[c].count() >= 30]]
    
    if prices.empty:
        return {"status": "Erro", "msg": "Histórico de cotações insuficiente."}
        
    returns = prices.pct_change().dropna(how="all")
    
    results = []
    ticker_clean_map = dict(zip(tickers_yf, tickers_clean))
    
    for yf_tick in prices.columns:
        clean_tick = ticker_clean_map.get(yf_tick, yf_tick)
        ret_series = returns[yf_tick].dropna()
        if len(ret_series) < 30:
            continue
            
        wins = ret_series[ret_series > 0]
        losses = ret_series[ret_series < 0]
        
        total_days = len(ret_series)
        win_days = len(wins)
        
        if total_days == 0 or win_days == 0 or len(losses) == 0:
            continue
            
        p = win_days / total_days
        avg_win = float(wins.mean())
        avg_loss = abs(float(losses.mean()))
        
        b = avg_win / avg_loss if avg_loss > 0 else 1.0
        
        f = p - (1 - p) / b
        if f < 0:
            f = 0.0
            
        results.append({
            "ticker": clean_tick,
            "win_rate": round(p * 100, 2),
            "win_loss_ratio": round(b, 2),
            "kelly_full": round(f * 100, 2),
            "kelly_half_limit": round(min(f * 0.5, 0.12) * 100, 2),
            "kelly_quarter_limit": round(min(f * 0.25, 0.12) * 100, 2)
        })
        
    results.sort(key=lambda x: x["kelly_quarter_limit"], reverse=True)
    return {
        "status": "Sucesso",
        "data": results
    }

def calculate_alpha_attribution(session, fetch_prices) -> dict:
    uid = _get_current_user_id()
    query = session.query(Position)
    if uid is not None:
        query = query.filter_by(user_id=uid)
    positions = query.filter(Position.quantity > 0).all()
    tickers_yf, tickers_clean, categories, weights_val = [], [], [], []
    total_val = 0.0
    
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
            
        tickers_yf.append(_to_yf_ticker(pos.asset.ticker, cat))
        tickers_clean.append(pos.asset.ticker.upper())
        categories.append(cat)
        weights_val.append(val)
        total_val += val
        
    if not tickers_yf:
        return {"status": "Erro", "msg": "Sem ativos de renda variável ativos na carteira."}
        
    BENCHMARK = "^BVSP"
    raw = fetch_prices(list(set(tickers_yf)) + [BENCHMARK], period="1y")
    prices = (
        raw.xs("Close", axis=1, level=1)
        if hasattr(raw.columns, "levels")
        else (raw["Close"] if "Close" in raw.columns else raw)
    )
    prices = _align_prices_to_b3(prices)
    prices = prices[[c for c in prices.columns if prices[c].count() >= 30]]
    
    if BENCHMARK not in prices.columns:
        return {"status": "Erro", "msg": "Histórico do Benchmark indisponível."}
        
    log_ret = np.log(prices / prices.shift(1)).dropna()
    bench = log_ret[BENCHMARK]
    
    decay_factor = 0.94
    alpha_ewma = 1.0 - decay_factor
    
    ewma_mean = log_ret.ewm(alpha=alpha_ewma).mean().iloc[-1]
    ewma_cov_df = log_ret.ewm(alpha=alpha_ewma).cov().xs(log_ret.index[-1])
    
    rf = get_risk_free_rate()
    ann_b = float(ewma_mean[BENCHMARK] * 252)
    var_b = float(ewma_cov_df.loc[BENCHMARK, BENCHMARK])
    
    results = []
    portfolio_alpha = 0.0
    portfolio_beta = 0.0
    portfolio_return = 0.0
    
    ticker_clean_map = dict(zip(tickers_yf, tickers_clean))
    
    for yf_tick, val in zip(tickers_yf, weights_val):
        if yf_tick not in log_ret.columns:
            continue
        clean_tick = ticker_clean_map.get(yf_tick, yf_tick)
        w_i = val / total_val
        
        ann_i = float(ewma_mean[yf_tick] * 252)
        cov_i_b = float(ewma_cov_df.loc[yf_tick, BENCHMARK])
        beta_i = cov_i_b / var_b if var_b > 0 else 1.0
        
        alpha_i = ann_i - (rf + beta_i * (ann_b - rf))
        
        weighted_alpha = w_i * alpha_i
        portfolio_alpha += weighted_alpha
        portfolio_beta += w_i * beta_i
        portfolio_return += w_i * ann_i
        
        results.append({
            "ticker": clean_tick,
            "weight_pct": round(w_i * 100, 2),
            "asset_alpha_pct": round(alpha_i * 100, 2),
            "weighted_alpha_pct": round(weighted_alpha * 100, 2),
            "beta": round(beta_i, 2),
            "pct_contribution": 0.0
        })
        
    for item in results:
        weighted_alpha_pct = item["weighted_alpha_pct"]
        if portfolio_alpha != 0:
            item["pct_contribution"] = round((weighted_alpha_pct / (portfolio_alpha * 100)) * 100, 2)
            
    results.sort(key=lambda x: x["weighted_alpha_pct"], reverse=True)
    
    return {
        "status": "Sucesso",
        "portfolio_alpha_pct": round(portfolio_alpha * 100, 2),
        "portfolio_beta": round(portfolio_beta, 2),
        "portfolio_return_pct": round(portfolio_return * 100, 2),
        "data": results
    }

def calculate_rolling_sharpe(session, fetch_prices) -> dict:
    uid = _get_current_user_id()
    query = session.query(Position)
    if uid is not None:
        query = query.filter_by(user_id=uid)
    positions = query.filter(Position.quantity > 0).all()
    tickers_yf, tickers_clean, weights_val = [], [], []
    total_val = 0.0
    
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
        tickers_yf.append(_to_yf_ticker(pos.asset.ticker, cat))
        tickers_clean.append(pos.asset.ticker.upper())
        weights_val.append(val)
        total_val += val
        
    if not tickers_yf:
        return {"status": "Erro", "msg": "Sem ativos de renda variável ativos na carteira."}
        
    raw = fetch_prices(list(set(tickers_yf)), period="1y")
    prices = (
        raw.xs("Close", axis=1, level=1)
        if hasattr(raw.columns, "levels")
        else (raw["Close"] if "Close" in raw.columns else raw)
    )
    prices = _align_prices_to_b3(prices)
    prices = prices[[c for c in prices.columns if prices[c].count() >= 95]]
    
    if prices.empty or prices.shape[1] < 1:
        return {"status": "Erro", "msg": "Histórico de cotações insuficiente para janela móvel de 90 dias."}
        
    log_ret = np.log(prices / prices.shift(1)).dropna()
    rf = get_risk_free_rate()
    
    avail_tickers = log_ret.columns.tolist()
    ticker_clean_map = dict(zip(tickers_yf, tickers_clean))
    
    av_weights = np.array([weights_val[tickers_yf.index(t)] for t in avail_tickers])
    w = av_weights / av_weights.sum() if av_weights.sum() > 0 else np.array([1.0 / len(avail_tickers)] * len(avail_tickers))
    
    port_ret = log_ret[avail_tickers].dot(w)
    
    df_returns = log_ret[avail_tickers].copy()
    df_returns["portfolio"] = port_ret
    
    window = 90
    rolling_means = df_returns.rolling(window=window).mean()
    rolling_stds = df_returns.rolling(window=window).std()
    
    dates_raw = df_returns.index[window - 1:]
    dates_str = [str(d.date()) for d in dates_raw]
    
    series_data = {}
    for col in df_returns.columns:
        col_name = ticker_clean_map.get(col, "portfolio")
        sharpe_series = []
        for idx in range(window - 1, len(df_returns)):
            mean_val = rolling_means[col].iloc[idx]
            std_val = rolling_stds[col].iloc[idx]
            
            ann_ret = mean_val * 252
            ann_vol = std_val * np.sqrt(252)
            
            sharpe = (ann_ret - rf) / ann_vol if ann_vol > 0 else 0.0
            sharpe_series.append(round(float(sharpe), 3))
            
        series_data[col_name] = sharpe_series
        
    return {
        "status": "Sucesso",
        "dates": dates_str,
        "series": series_data
    }

def calculate_momentum_ranking(session, fetch_prices) -> dict:
    uid = _get_current_user_id()
    query = session.query(Position)
    if uid is not None:
        query = query.filter_by(user_id=uid)
    positions = query.filter(Position.quantity > 0).all()
    tickers_yf, tickers_clean = [], []
    
    for pos in positions:
        if not pos.asset:
            continue
        cat = pos.asset.category.name if pos.asset.category else ""
        if cat in ["Renda Fixa", "Reserva"]:
            continue
        tickers_yf.append(_to_yf_ticker(pos.asset.ticker, cat))
        tickers_clean.append(pos.asset.ticker.upper())
        
    if not tickers_yf:
        return {"status": "Erro", "msg": "Sem ativos de renda variável ativos na carteira."}
        
    raw = fetch_prices(list(set(tickers_yf)), period="1y")
    prices = (
        raw.xs("Close", axis=1, level=1)
        if hasattr(raw.columns, "levels")
        else (raw["Close"] if "Close" in raw.columns else raw)
    )
    prices = _align_prices_to_b3(prices)
    
    results = []
    ticker_clean_map = dict(zip(tickers_yf, tickers_clean))
    
    for col in prices.columns:
        p_series = prices[col].dropna()
        if len(p_series) < 50:
            continue
            
        price_start = float(p_series.iloc[0])
        idx_21 = max(-21, -len(p_series))
        price_1m = float(p_series.iloc[idx_21])
        
        score = (price_1m / price_start) - 1.0 if price_start > 0 else 0.0
        
        results.append({
            "ticker": ticker_clean_map.get(col, col),
            "momentum_score_pct": round(score * 100, 2)
        })
        
    results.sort(key=lambda x: x["momentum_score_pct"], reverse=True)
    
    ranked_results = []
    for idx, item in enumerate(results):
        ranked_results.append({
            "rank": idx + 1,
            **item
        })
        
    return {
        "status": "Sucesso",
        "data": ranked_results
    }
