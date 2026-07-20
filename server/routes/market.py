from flask import Blueprint, jsonify
import yfinance as yf
import time
import logging
from datetime import datetime, timezone
from utils.http_client import get_secure_session

market_bp = Blueprint('market', __name__)

# --- CACHE EM MEMÓRIA ---
MARKET_CACHE = {
    "data": {
        "ibov": {"price": 128500.0, "change": 0.45},
        "ifix": {"price": 3350.0, "change": 0.12},
        "nasdaq": {"price": 16200.0, "change": 0.85},
        "sp500": {"price": 5120.0, "change": 0.62},
        "dolar": {"price": 5.48, "change": -0.32},
        "btc": {"price": 67500.0, "change": 1.45}
    },
    "last_update": 0
}

def load_market_cache_from_db():
    """Recupera os índices macro do banco de dados (SystemCache) compartilhado"""
    import json
    from db.models import Session, SystemCache
    with Session() as session:
        try:
            record = session.query(SystemCache).filter_by(key="market_indices").first()
            if record:
                cached = json.loads(record.value)
                MARKET_CACHE["data"] = cached.get("data", MARKET_CACHE["data"])
                MARKET_CACHE["last_update"] = cached.get("last_update", 0)
        except Exception as e:
            logging.warning(f"⚠️ Falha ao ler índices de mercado do banco de dados: {e}")

def save_market_cache_to_db():
    """Persiste os índices macro no banco de dados (SystemCache) compartilhado"""
    import json
    from db.models import Session, SystemCache, safe_commit
    from datetime import datetime
    with Session() as session:
        try:
            record = session.query(SystemCache).filter_by(key="market_indices").first()
            if not record:
                record = SystemCache(key="market_indices")
                session.add(record)
            record.value = json.dumps(MARKET_CACHE)
            record.updated_at = datetime.now()
            safe_commit(session)
        except Exception as e:
            session.rollback()
            logging.warning(f"⚠️ Falha ao persistir índices de mercado no banco de dados: {e}")

def update_market_cache():
    """Atualiza os dados de mercado em background com proteção de rede e salvamento individual robusto"""
    logging.info("🔄 JOB: Atualizando índices de mercado (IBOV/IFIX)...")
    secure_session = get_secure_session()
    updated = False
    
    indices = [
        {"ticker": "^BVSP", "key": "ibov", "name": "IBOV", "decimals": 2},
        {"ticker": "IFIX.SA", "key": "ifix", "name": "IFIX", "decimals": 2, "fallback": "XFIX11.SA"},
        {"ticker": "^IXIC", "key": "nasdaq", "name": "NASDAQ", "decimals": 2},
        {"ticker": "^GSPC", "key": "sp500", "name": "S&P 500", "decimals": 2},
        {"ticker": "USDBRL=X", "key": "dolar", "name": "Dólar", "decimals": 4},
        {"ticker": "BTC-USD", "key": "btc", "name": "BTC", "decimals": 2}
    ]

    import pandas as pd
    for idx in indices:
        try:
            df = yf.download(idx["ticker"], period="5d", progress=False, session=secure_session)
            if df.empty and idx.get("fallback"):
                df = yf.download(idx["fallback"], period="5d", progress=False, session=secure_session)
                
            if not df.empty:
                if isinstance(df.columns, pd.MultiIndex):
                    df.columns = df.columns.get_level_values(0)
                
                close_col = 'Close' if 'Close' in df.columns else ('Adj Close' if 'Adj Close' in df.columns else None)
                if close_col:
                    series = df[close_col].dropna()
                    if isinstance(series, pd.DataFrame):
                        series = series.iloc[:, 0]
                        
                    if len(series) >= 1:
                        atual = float(series.iloc[-1])
                        variacao = 0.0
                        
                        last_date_str = series.index[-1].strftime('%Y-%m-%d')
                        today_str = datetime.now(timezone.utc).strftime('%Y-%m-%d')
                        
                        if len(series) >= 2 and last_date_str == today_str:
                            anterior = float(series.iloc[-2])
                            variacao = ((atual - anterior) / anterior) * 100
                            
                        MARKET_CACHE["data"][idx["key"]] = {
                            "price": round(atual, idx["decimals"]),
                            "change": round(variacao, 2)
                        }
                        MARKET_CACHE["last_update"] = time.time()
                        updated = True
                        logging.info(f"✅ {idx['name']} atualizado: {atual:.{idx['decimals']}f} ({variacao:.2f}%)")
        except Exception as e:
            logging.warning(f"⚠️ Falha ao atualizar {idx['name']}: {e}")

    if updated:
        save_market_cache_to_db()

@market_bp.route('/indices', methods=['GET'])
def get_market_indices():
    load_market_cache_from_db()
    return jsonify(MARKET_CACHE["data"])

@market_bp.route('/brief', methods=['GET'])
def get_market_brief():
    """Provides a quick institutional summary statement for the executive headers."""
    load_market_cache_from_db()
    ibov_change = MARKET_CACHE["data"].get("ibov", {}).get("change", 0.0)
    sp500_change = MARKET_CACHE["data"].get("sp500", {}).get("change", 0.0)
    
    # Heurística rápida de sentimento macro baseada no IBOV e S&P500
    if ibov_change > 0.5 and sp500_change > 0.5:
        sentiment = "BULLISH"
        summary = "Mercados operando em forte alta coordenada globalmente."
    elif ibov_change < -0.5 and sp500_change < -0.5:
        sentiment = "BEARISH"
        summary = "Aversão a risco severa derruba índices macro globais."
    else:
        sentiment = "NEUTRAL"
        summary = "Índices operando dentro das margens normais de volatilidade diária."
        
    return jsonify({
        "status": "Sucesso",
        "sentiment": sentiment,
        "summary": summary,
        "last_update": MARKET_CACHE.get("last_update", 0)
    })
