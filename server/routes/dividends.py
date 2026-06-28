from flask import Blueprint, jsonify
from database.models import Dividend, Asset, Session, Position # ⚡ Importada a factory controlada thread-safe
import logging
from services import PortfolioService

dividends_bp = Blueprint('dividends', __name__)
service = PortfolioService()

@dividends_bp.route('/api/dividends/history', methods=['GET'])
def get_dividend_history():
    # ⚡ Gerenciador de Contexto: Garante liberação e fechamento imediato de conexões no SQLite
    with Session() as session:
        try:
            # Busca todos os dividendos carimbados, ordenando pelos mais recentes
            history = session.query(Dividend).join(Asset).order_by(Dividend.date_com.desc()).all()
            
            results = []
            for div in history:
                results.append({
                    "ticker": div.asset.ticker if div.asset else "UNKNOWN",
                    "date": div.date_com.strftime('%Y-%m-%d') if div.date_com else None, 
                    "date_com": div.date_com.strftime('%Y-%m-%d') if div.date_com else None, 
                    "value_per_share": div.value_per_share,
                    "quantity": div.quantity_at_date,
                    "total": div.total_value,
                    "status": div.status 
                })
            return jsonify(results)
        except Exception as e:
            logging.error(f"❌ Erro crítico na extração da rota de histórico de dividendos: {e}")
            return jsonify({"error": "Falha interna ao processar histórico de proventos"}), 500

@dividends_bp.route('/api/dividends/yoc', methods=['GET'])
def get_dividend_yoc():
    """Calcula o Dividend Yield on Cost (YOC) Preditivo de cada ativo na carteira."""
    with Session() as session:
        try:
            # 1. Busca previsões de dividendos
            forecast_res = service.calculate_dividend_forecast()
            details = forecast_res.get("details", [])
            
            # Agrupa o valor projetado total por ticker
            projected_map = {}
            for f in details:
                t = f["ticker"]
                projected_map[t] = projected_map.get(t, 0.0) + f["amount"]
                
            # 2. Busca posições
            positions = session.query(Position).filter(Position.quantity > 0).all()
            
            yoc_list = []
            for pos in positions:
                if not pos.asset:
                    continue
                ticker = pos.asset.ticker.upper()
                qty = float(pos.quantity)
                avg_price = float(pos.average_price)
                cost = qty * avg_price
                
                projected_div = projected_map.get(ticker, 0.0)
                yoc = (projected_div / cost * 100) if cost > 0 else 0.0
                
                # Preço atual para fins de comparação com o DY atual
                mdata = pos.asset.market_data[0] if pos.asset.market_data else None
                price = float(mdata.price or 0) if mdata else avg_price
                current_value = qty * price
                dy_atual = (projected_div / current_value * 100) if current_value > 0 else 0.0
                
                yoc_list.append({
                    "ticker": ticker,
                    "quantity": qty,
                    "average_price": avg_price,
                    "cost": round(cost, 2),
                    "current_price": price,
                    "current_value": round(current_value, 2),
                    "projected_dividend_12m": round(projected_div, 2),
                    "yoc": round(yoc, 2),
                    "dy_atual": round(dy_atual, 2)
                })
                
            # Ordena por YOC decrescente
            yoc_list.sort(key=lambda x: x["yoc"], reverse=True)
            return jsonify(yoc_list)
        except Exception as e:
            logging.error(f"❌ Erro ao calcular YOC Preditivo: {e}", exc_info=True)
            return jsonify([]), 500
