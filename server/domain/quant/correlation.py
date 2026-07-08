# server/domain/quant/correlation.py
import logging
import numpy as np
from database.models import get_active_positions
from domain.quant.helpers import _to_yf_ticker, _align_prices_to_b3, _get_current_user_id, _extract_close_prices

def get_correlation_matrix(session, fetch_prices) -> dict:
    logging.info("🧮 Calculando matriz de correlação...")
    import pandas as pd

    uid = _get_current_user_id()
    positions = get_active_positions(session, uid).all()
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
    prices = _extract_close_prices(raw)

    prices = prices.dropna(axis=1, how="all")
    prices = _align_prices_to_b3(prices)
    prices = prices[[c for c in prices.columns if prices[c].count() >= 30]]
    if prices.shape[1] < 2:
        return {"status": "Erro", "msg": "Dados insuficientes para correlação."}

    ret = prices.pct_change().dropna()
    if ret.shape[0] < 30:
        return {"status": "Erro", "msg": f"Apenas {ret.shape[0]} pregões comuns."}

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

def calculate_sector_correlation(session, fetch_prices) -> dict:
    logging.info("🧮 Calculando Matriz de Correlação Setorial...")
    
    uid = _get_current_user_id()
    positions = get_active_positions(session, uid).all()
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
    prices = _extract_close_prices(raw)
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
    decay_factor = 0.94
    alpha_ewma = 1.0 - decay_factor
    ewma_corr_df = returns.ewm(alpha=alpha_ewma).corr()
    corr_matrix = ewma_corr_df.xs(returns.index[-1]).fillna(0.0)
    
    sorted_assets = sorted(zip(tickers_yf, tickers_clean, categories), key=lambda x: x[2])
    
    final_tickers = []
    final_categories = []
    
    for yf_tick, clean_tick, cat in sorted_assets:
        if yf_tick in corr_matrix.columns:
            final_tickers.append(clean_tick)
            final_categories.append(cat)
            
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
