# server/domain/quant/monte_carlo.py
import logging
import numpy as np
from database.models import Position
from domain.quant.helpers import _to_yf_ticker, _align_prices_to_b3

def _get_current_user_id():
    try:
        from flask import has_request_context, g
        if has_request_context() and hasattr(g, 'user_id'):
            return g.user_id
    except Exception:
        pass
    return 1

def run_monte_carlo(session, fetch_prices, simulations=1000, days=252) -> dict:
    import pandas as pd

    uid = _get_current_user_id()
    query = session.query(Position)
    if uid is not None:
        query = query.filter_by(user_id=uid)
    positions = (
        query
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
    
    port_ret_ann = port_ret * 252
    port_vol_ann = port_vol * np.sqrt(252)
    
    has_crypto = any(
        (pos.asset.category.name if pos.asset.category else "") in ["Cripto", "Criptomoeda"]
        for pos in positions if pos.asset
    )
    if not has_crypto:
        port_vol_ann = min(port_vol_ann, 1.50)
        
    dt = 1.0 / days
    lambda_jump = 0.5    
    mu_jump = -0.10      
    sigma_jump = 0.15    
    
    kappa = np.exp(mu_jump + 0.5 * sigma_jump ** 2) - 1
    drift_ann = port_ret_ann - lambda_jump * kappa - 0.5 * port_vol_ann ** 2
    
    shocks = np.random.normal(loc=drift_ann * dt, scale=port_vol_ann * np.sqrt(dt), size=(simulations, days))
    
    poi_lam = lambda_jump * dt
    jump_counts = np.random.poisson(lam=poi_lam, size=(simulations, days))
    jump_shocks = jump_counts * mu_jump + np.sqrt(jump_counts) * sigma_jump * np.random.normal(size=(simulations, days))
    
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
