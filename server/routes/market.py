from flask import Blueprint, jsonify
import yfinance as yf

market_bp = Blueprint('market', __name__)

@market_bp.route('/indices', methods=['GET'])
def get_market_indices():
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
                    # AQUI APLICAMOS O MULTIPLICADOR PARA O VALOR FICAR "BONITO"
                    "price": atual * multiplier, 
                    "change": variacao
                }
            except Exception as e:
                return None

        return jsonify({
            "ibov": get_stats("^BVSP", 1.0), # IBOV é original (x1)
            "ifix": get_stats("XFIX11.SA", 283.33) # XFIX x 283.33 ≈ Valor do IFIX
        })

    except Exception as e:
        print(f"Erro Market Data: {e}")
        return jsonify({"error": "Falha ao buscar índices"}), 500
