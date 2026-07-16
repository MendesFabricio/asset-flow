# server/routes/maintenance.py
from flask import Blueprint, jsonify, request
from services import PortfolioService
from database.models import Position, Session, safe_commit, engine
from utils.db_utils import with_safe_commit
from sqlalchemy import text
import logging

maintenance_bp = Blueprint('maintenance', __name__)

# 🧼 CORREÇÃO DE SHADOWING: Rota duplicada /api/simulation removida.
# O gerenciamento global da projeção de Monte Carlo agora é centralizado exclusivamente em dashboard.py e assets.py.

@maintenance_bp.route('/api/update_category_meta', methods=['POST'])
def update_category_meta():
    try:
        data = request.json or {}
        
        # ⚡ ISOLAMENTO DE THREAD: Instanciação local para garantir que o estado mutável do serviço
        # não seja compartilhado e corrompido em cliques simultâneos de usuários.
        service = PortfolioService()
        msg = service.update_category_meta(data.get('category'), data.get('meta'))
        return jsonify({"status": "Sucesso", "msg": msg})
    except ValueError as e:
        return jsonify({"status": "Erro", "msg": str(e)}), 404
    except Exception as e:
        logging.error(f"❌ Erro ao atualizar metas de alocação das categorias: {e}")
        return jsonify({"status": "Erro", "msg": str(e)}), 500
