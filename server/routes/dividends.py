from flask import Blueprint, jsonify
from database.models import Dividend, Asset, Session # ⚡ Importada a factory controlada thread-safe
import logging

dividends_bp = Blueprint('dividends', __name__)

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
