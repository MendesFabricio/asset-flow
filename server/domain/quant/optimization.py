# server/domain/quant/optimization.py
import logging
import numpy as np
import json
from datetime import datetime
from database.models import Position, SystemCache, safe_commit
from domain.quant.helpers import _to_yf_ticker, _align_prices_to_b3, get_risk_free_rate

def calculate_risk_parity(session, fetch_prices) -> dict:
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
    decay_factor = 0.94
    alpha_ewma = 1.0 - decay_factor
    ewma_cov_df = log_ret.ewm(alpha=alpha_ewma).cov()
    cov = ewma_cov_df.xs(log_ret.index[-1]).fillna(0.0)
    
    avail_tickers = log_ret.columns.tolist()
    n = len(avail_tickers)
    
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

def calculate_markowitz_optimization(session, fetch_prices) -> dict:
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
    decay_factor = 0.94
    alpha_ewma = 1.0 - decay_factor
    
    mean_returns = log_ret.ewm(alpha=alpha_ewma).mean().iloc[-1]
    ewma_cov_df = log_ret.ewm(alpha=alpha_ewma).cov()
    cov_matrix = ewma_cov_df.xs(log_ret.index[-1]).fillna(0.0)
    
    avail_tickers = log_ret.columns.tolist()
    N = len(avail_tickers)
    risk_free = get_risk_free_rate()
    
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

def calculate_efficient_frontier_points(session, fetch_prices) -> dict:
    import pandas as pd
    
    positions = session.query(Position).filter(Position.quantity > 0).all()
    tickers_yf, tickers_clean = [], []
    for pos in positions:
        if not pos.asset:
            continue
        cat = pos.asset.category.name if pos.asset.category else ""
        if cat in ["Renda Fixa", "Reserva"]:
            continue
        tickers_yf.append(_to_yf_ticker(pos.asset.ticker, cat))
        tickers_clean.append(pos.asset.ticker.upper())
        
    if len(tickers_yf) < 2:
        return {"status": "Erro", "msg": "Mínimo 2 ativos de renda variável ativos na carteira."}
        
    raw = fetch_prices(list(set(tickers_yf)), period="1y")
    prices = (
        raw.xs("Close", axis=1, level=1)
        if isinstance(raw.columns, pd.MultiIndex)
        else (raw["Close"] if "Close" in raw.columns else raw)
    )
    prices = _align_prices_to_b3(prices)
    prices = prices[[c for c in prices.columns if prices[c].count() >= 30]]
    
    if prices.shape[1] < 2:
        return {"status": "Erro", "msg": "Dados históricos insuficientes de renda variável."}
        
    log_ret = np.log(prices / prices.shift(1)).dropna()
    decay_factor = 0.94
    alpha_ewma = 1.0 - decay_factor
    
    mean_returns = log_ret.ewm(alpha=alpha_ewma).mean().iloc[-1]
    ewma_cov_df = log_ret.ewm(alpha=alpha_ewma).cov()
    cov_matrix = ewma_cov_df.xs(log_ret.index[-1]).fillna(0.0)
    
    avail_tickers = log_ret.columns.tolist()
    N = len(avail_tickers)
    risk_free = get_risk_free_rate()
    ticker_clean_map = dict(zip(tickers_yf, tickers_clean))
    
    num_portfolios = 5000
    weights_matrix = np.random.random((num_portfolios, N))
    weights_matrix = weights_matrix / np.sum(weights_matrix, axis=1, keepdims=True)
    
    p_rets = np.dot(weights_matrix, mean_returns) * 252
    cov_ann = cov_matrix.to_numpy() * 252
    p_vols = np.sqrt(np.einsum('ij,jk,ik->i', weights_matrix, cov_ann, weights_matrix))
    p_sharpes = np.where(p_vols > 0, (p_rets - risk_free) / p_vols, 0.0)
    
    max_sharpe_idx = np.argmax(p_sharpes)
    best_weights = weights_matrix[max_sharpe_idx]
    max_sharpe_pt = {
        "retorno": round(float(p_rets[max_sharpe_idx]) * 100, 2),
        "volatilidade": round(float(p_vols[max_sharpe_idx]) * 100, 2),
        "sharpe": round(float(p_sharpes[max_sharpe_idx]), 3),
        "weights": {ticker_clean_map.get(t, t): round(float(w_val) * 100, 2) for t, w_val in zip(avail_tickers, best_weights)}
    }
    
    min_vol_idx = np.argmin(p_vols)
    min_vol_weights = weights_matrix[min_vol_idx]
    min_vol_pt = {
        "retorno": round(float(p_rets[min_vol_idx]) * 100, 2),
        "volatilidade": round(float(p_vols[min_vol_idx]) * 100, 2),
        "sharpe": round(float(p_sharpes[min_vol_idx]), 3),
        "weights": {ticker_clean_map.get(t, t): round(float(w_val) * 100, 2) for t, w_val in zip(avail_tickers, min_vol_weights)}
    }
    
    sample_indices = np.random.choice(num_portfolios, size=min(150, num_portfolios), replace=False)
    cloud_points = [
        {
            "retorno": round(float(p_rets[idx]) * 100, 2),
            "volatilidade": round(float(p_vols[idx]) * 100, 2),
            "sharpe": round(float(p_sharpes[idx]), 3)
        }
        for idx in sample_indices
    ]
    
    num_bins = 30
    min_ret, max_ret = p_rets.min(), p_rets.max()
    bin_edges = np.linspace(min_ret, max_ret, num_bins + 1)
    frontier_points = []
    
    for j in range(num_bins):
        indices = np.where((p_rets >= bin_edges[j]) & (p_rets < bin_edges[j+1]))[0]
        if len(indices) > 0:
            min_vol_bin_idx = indices[np.argmin(p_vols[indices])]
            w_bin = weights_matrix[min_vol_bin_idx]
            frontier_points.append({
                "retorno": round(float(p_rets[min_vol_bin_idx]) * 100, 2),
                "volatilidade": round(float(p_vols[min_vol_bin_idx]) * 100, 2),
                "sharpe": round(float(p_sharpes[min_vol_bin_idx]), 3),
                "weights": {ticker_clean_map.get(t, t): round(float(w_val) * 100, 2) for t, w_val in zip(avail_tickers, w_bin)}
            })
            
    frontier_points.sort(key=lambda x: x["retorno"])
    
    output = {
        "status": "Sucesso",
        "frontier": frontier_points,
        "cloud": cloud_points,
        "max_sharpe": max_sharpe_pt,
        "min_vol": min_vol_pt
    }
    
    try:
        cache_record = session.query(SystemCache).filter_by(key="efficient_frontier").first()
        if not cache_record:
            cache_record = SystemCache(key="efficient_frontier")
            session.add(cache_record)
        cache_record.value = json.dumps(output)
        cache_record.updated_at = datetime.now()
        safe_commit(session)
    except Exception as cache_err:
        logging.error(f"❌ Falha ao salvar cache de Fronteira Eficiente no banco: {cache_err}")
        
    return output
