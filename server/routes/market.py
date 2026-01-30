from flask import Blueprint, jsonify
import yfinance as yf
import time
import logging

market_bp = Blueprint('market', __name__)

# --- CACHE EM MEMÓRIA ---
# Guarda os dados para não consultar o Yahoo a toda hora
MARKET_CACHE = {
    "data": {
        "ibov": {"price": 0, "change": 0},
        "ifix": {"price": 0, "change": 0}
    },
    "last_update": 0
}

def update_market_cache():
    """
    Função chamada pelo Agendador (backend.py) para atualizar os dados em background.
    """
    logging.info("🔄 JOB: Atualizando índices de mercado (IBOV/IFIX)...")
    try:
        # TRUQUE: Usamos XFIX11.SA (ETF) pois o IFIX.SA falha muito no Yahoo
        tickers = ["^BVSP", "XFIX11.SA"] 
        
        # Baixa dados dos últimos 5 dias
        df = yf.download(tickers, period="5d", progress=False)['Close']
        
        def get_stats(symbol, multiplier=1.0):
            try:
                # Remove dias vazios
                series = df[symbol].dropna()
                if len(series) < 2: return None
                
                atual = float(series.iloc[-1])
                anterior = float(series.iloc[-2])
                variacao = ((atual - anterior) / anterior) * 100
                
                return {
                    "price": atual * multiplier, 
                    "change": variacao
                }
            except:
                return None

        new_data = {
            "ibov": get_stats("^BVSP", 1.0),
            "ifix": get_stats("XFIX11.SA", 283.33)
        }

        # Atualiza o cache global se vieram dados válidos
        if new_data["ibov"] or new_data["ifix"]:
            MARKET_CACHE["data"] = new_data
            MARKET_CACHE["last_update"] = time.time()
            logging.info("✅ JOB: Índices atualizados no cache.")
        
    except Exception as e:
        logging.error(f"❌ Erro ao atualizar índices: {e}")

@market_bp.route('/indices', methods=['GET'])
def get_market_indices():
    # A rota agora é burra e rápida: só entrega o que está na memória
    return jsonify(MARKET_CACHE["data"])
