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
    """Atualiza os dados de mercado em background com proteção de rede e suporte a MultiIndex"""
    import pandas as pd
    logging.info("🔄 JOB: Atualizando índices de mercado (IBOV/IFIX)...")
    try:
        tickers = ["^BVSP", "XFIX11.SA"] 
        secure_session = get_secure_session()
        
        df = yf.download(tickers, period="5d", progress=False, session=secure_session)
        
        if df.empty:
            logging.warning("⚠️ Dados de mercado retornados vazios pelo Yahoo.")
            return

        # Extração segura baseada nas camadas do Pandas MultiIndex
        if isinstance(df.columns, pd.MultiIndex):
            if 'Close' in df.columns.levels[0]:
                close_df = df['Close']
            elif 'Adj Close' in df.columns.levels[0]:
                close_df = df['Adj Close']
            else:
                logging.warning("⚠️ Coluna de fechamento não localizada no MultiIndex do Yahoo.")
                return
        else:
            if 'Close' in df.columns:
                close_df = df[['Close']]
            else:
                close_df = df

        def get_stats(symbol, multiplier=1.0):
            try:
                if symbol not in close_df.columns:
                    return None
                    
                series = close_df[symbol].dropna()
                if len(series) < 2: return None
                
                atual = float(series.iloc[-1])
                anterior = float(series.iloc[-2])
                variacao = ((atual - anterior) / anterior) * 100
                
                return {
                    "price": atual * multiplier, 
                    "change": variacao
                }
            except Exception as e:
                logging.warning(f"⚠️ Falha ao processar estatísticas do ativo {symbol}: {e}")
                return None

        new_data = {
            "ibov": get_stats("^BVSP", 1.0),
            "ifix": get_stats("XFIX11.SA", 283.33)
        }

        if new_data["ibov"] or new_data["ifix"]:
            MARKET_CACHE["data"] = new_data
            MARKET_CACHE["last_update"] = time.time()
            logging.info("✅ JOB: Índices atualizados no cache com sucesso.")
        
    except Exception as e:
        logging.error(f"❌ Erro crítico ao atualizar índices de mercado: {e}")

@market_bp.route('/indices', methods=['GET'])
def get_market_indices():
    return jsonify(MARKET_CACHE["data"])
