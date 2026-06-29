from flask import Blueprint, jsonify
import yfinance as yf
import time
import logging
import requests
from requests.adapters import HTTPAdapter
from urllib3.util import Retry

market_bp = Blueprint('market', __name__)

# --- CACHE EM MEMÓRIA ---
MARKET_CACHE = {
    "data": {
        "ibov": {"price": 0, "change": 0},
        "ifix": {"price": 0, "change": 0}
    },
    "last_update": 0
}

def load_market_cache_from_db():
    """Recupera os índices macro do banco de dados (SystemCache) compartilhado"""
    import json
    from database.models import Session, SystemCache
    session = Session()
    try:
        record = session.query(SystemCache).filter_by(key="market_indices").first()
        if record:
            cached = json.loads(record.value)
            MARKET_CACHE["data"] = cached.get("data", MARKET_CACHE["data"])
            MARKET_CACHE["last_update"] = cached.get("last_update", 0)
    except Exception as e:
        logging.warning(f"⚠️ Falha ao ler índices de mercado do banco de dados: {e}")
    finally:
        session.close()

def save_market_cache_to_db():
    """Persiste os índices macro no banco de dados (SystemCache) compartilhado"""
    import json
    from database.models import Session, SystemCache, safe_commit
    from datetime import datetime
    session = Session()
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
    finally:
        session.close()

def get_secure_session():
    """🛡️ Cria uma sessão HTTP disfarçada de navegador real com política de Timeout"""
    session = requests.Session()
    retries = Retry(total=3, backoff_factor=0.3, status_forcelist=[500, 502, 503, 504])
    
    # ⚡ O ACESSÓRIO ESSENCIAL: Identifica a chamada como um Google Chrome legítimo.
    # Sem isso, o firewall do Yahoo joga o YFRateLimitError na hora!
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"
    })
    
    class TimeoutHTTPAdapter(HTTPAdapter):
        def send(self, request, **kwargs):
            kwargs["timeout"] = kwargs.get("timeout", 10)
            return super().send(request, **kwargs)
            
    adapter = TimeoutHTTPAdapter(max_retries=retries, pool_connections=20, pool_maxsize=20)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session

def update_market_cache():
    """Atualiza os dados de mercado em background com proteção de rede e salvamento individual robusto"""
    logging.info("🔄 JOB: Atualizando índices de mercado (IBOV/IFIX)...")
    secure_session = get_secure_session()
    updated = False
    
    # 1. Atualiza IBOV (^BVSP)
    try:
        df_ibov = yf.download("^BVSP", period="5d", progress=False, session=secure_session)
        if not df_ibov.empty:
            import pandas as pd
            if isinstance(df_ibov.columns, pd.MultiIndex):
                df_ibov.columns = df_ibov.columns.get_level_values(0)
            close_col = 'Close' if 'Close' in df_ibov.columns else ('Adj Close' if 'Adj Close' in df_ibov.columns else None)
            if close_col:
                series = df_ibov[close_col].dropna()
                if isinstance(series, pd.DataFrame):
                    series = series.iloc[:, 0]
                if len(series) >= 2:
                    atual = float(series.iloc[-1])
                    anterior = float(series.iloc[-2])
                    variacao = ((atual - anterior) / anterior) * 100
                    MARKET_CACHE["data"]["ibov"] = {
                        "price": round(atual, 2),
                        "change": round(variacao, 2)
                    }
                    MARKET_CACHE["last_update"] = time.time()
                    updated = True
                    logging.info(f"✅ IBOV atualizado: {atual:.2f} ({variacao:.2f}%)")
    except Exception as e:
        logging.warning(f"⚠️ Falha ao atualizar IBOV: {e}")

    # 2. Atualiza IFIX (IFIX.SA)
    try:
        df_ifix = yf.download("IFIX.SA", period="5d", progress=False, session=secure_session)
        if not df_ifix.empty:
            import pandas as pd
            if isinstance(df_ifix.columns, pd.MultiIndex):
                df_ifix.columns = df_ifix.columns.get_level_values(0)
            close_col = 'Close' if 'Close' in df_ifix.columns else ('Adj Close' if 'Adj Close' in df_ifix.columns else None)
            if close_col:
                series = df_ifix[close_col].dropna()
                if isinstance(series, pd.DataFrame):
                    series = series.iloc[:, 0]
                if len(series) >= 1:
                    atual = float(series.iloc[-1])
                    variacao = 0.0
                    if len(series) >= 2:
                        anterior = float(series.iloc[-2])
                        variacao = ((atual - anterior) / anterior) * 100
                    else:
                        # Fallback para obter variação do IFIX via ETF XFIX11.SA
                        try:
                            df_xfix = yf.download("XFIX11.SA", period="5d", progress=False, session=secure_session)
                            if not df_xfix.empty:
                                if isinstance(df_xfix.columns, pd.MultiIndex):
                                    df_xfix.columns = df_xfix.columns.get_level_values(0)
                                x_series = df_xfix[close_col].dropna()
                                if isinstance(x_series, pd.DataFrame):
                                    x_series = x_series.iloc[:, 0]
                                if len(x_series) >= 2:
                                    x_atual = float(x_series.iloc[-1])
                                    x_anterior = float(x_series.iloc[-2])
                                    variacao = ((x_atual - x_anterior) / x_anterior) * 100
                        except Exception as ex:
                            logging.warning(f"⚠️ Falha ao obter variação do IFIX via XFIX11: {ex}")
                    
                    MARKET_CACHE["data"]["ifix"] = {
                        "price": round(atual, 2),
                        "change": round(variacao, 2)
                    }
                    MARKET_CACHE["last_update"] = time.time()
                    updated = True
                    logging.info(f"✅ IFIX atualizado: {atual:.2f} ({variacao:.2f}%)")
    except Exception as e:
        logging.warning(f"⚠️ Falha ao atualizar IFIX: {e}")

    if updated:
        save_market_cache_to_db()

@market_bp.route('/indices', methods=['GET'])
def get_market_indices():
    load_market_cache_from_db()
    return jsonify(MARKET_CACHE["data"])
