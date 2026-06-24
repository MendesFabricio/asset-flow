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
    """🛡️ Cria uma sessão HTTP resiliente com Timeout e Retries automáticos para o yfinance"""
    session = requests.Session()
    retries = Retry(total=3, backoff_factor=0.3, status_forcelist=[500, 502, 503, 504])
    
    class TimeoutHTTPAdapter(HTTPAdapter):
        def send(self, request, **kwargs):
            kwargs["timeout"] = kwargs.get("timeout", 10) # ⚡ Força teto de 10s por requisição
            return super().send(request, **kwargs)
            
    adapter = TimeoutHTTPAdapter(max_retries=retries)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session

def update_market_cache():
    """Atualiza os dados de mercado em background com proteção de rede"""
    logging.info("🔄 JOB: Atualizando índices de mercado (IBOV/IFIX)...")
    try:
        tickers = ["^BVSP", "XFIX11.SA"] 
        secure_session = get_secure_session()
        
        # ⚡ Injetada a sessão com timeout forçado para evitar travamento de thread
        df = yf.download(tickers, period="5d", progress=False, session=secure_session)
        
        if df.empty or 'Close' not in df.columns:
            logging.warning("⚠️ Dados de mercado retornados vazios pelo Yahoo.")
            return

        close_df = df['Close']

        def get_stats(symbol, multiplier=1.0):
            try:
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
            logging.info("✅ JOB: Índices atualizados no cache.")
        
    except Exception as e:
        logging.error(f"❌ Erro crítico ao atualizar índices de mercado: {e}")

@market_bp.route('/indices', methods=['GET'])
def get_market_indices():
    return jsonify(MARKET_CACHE["data"])
