# server/routes/maintenance.py
from flask import Blueprint, jsonify, request
from services import PortfolioService
from database.models import Position, Session # ⚡ Importado a factory controlada corretamente
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

@maintenance_bp.route('/api/cleanup_trash', methods=['GET'])
def cleanup_trash():
    # 🛡️ CONTEXT MANAGER: Abre e fecha a conexão de forma atômica, eliminando leaks e deadlocks no SQLite
    with Session() as session:
        try:
            positions = session.query(Position).all()
            deleted_count = 0
            for pos in positions:
                if pos.asset is None:
                    session.delete(pos)
                    deleted_count += 1
            
            session.commit()
            logging.info(f"🧹 DB MAINTENANCE: Faxina concluída com sucesso. {deleted_count} posições órfãs expurgadas.")
            return jsonify({"status": "Sucesso", "msg": f"Faxina concluída! {deleted_count} itens removidos."})
        except Exception as e:
            session.rollback()
            logging.error(f"❌ Erro crítico durante a execução da faxina de posições órfãs: {e}")
            return jsonify({"status": "Erro", "msg": str(e)}), 500

@maintenance_bp.route('/api/maintenance/backup', methods=['POST', 'GET'])
def backup_database():
    import os
    # Obter token de autorização
    auth_header = request.headers.get("Authorization")
    token = None
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
    else:
        token = request.headers.get("X-Backup-Token") or request.args.get("token")

    expected_token = os.environ.get("BACKUP_TOKEN") or os.environ.get("BASIC_AUTH_PASSWORD") or "assetflow_backup_secret_2026"
    
    if not token or token != expected_token:
        logging.warning("⚠️ TENTATIVA DE BACKUP REJEITADA: Token inválido ou ausente.")
        return jsonify({"status": "Erro", "msg": "Não autorizado. Token de backup inválido ou ausente."}), 401

    try:
        from database.session import engine
        from sqlalchemy import text

        backup_path = '/app/data/backup_assetflow.db'
        
        # Garante a existência do diretório
        os.makedirs(os.path.dirname(backup_path), exist_ok=True)
        
        # O comando SQLite VACUUM INTO exige que o arquivo destino NÃO exista
        if os.path.exists(backup_path):
            os.remove(backup_path)
            
        with engine.connect() as conn:
            # Executa o backup quente atômico
            conn.execute(text(f"VACUUM INTO '{backup_path}'"))
            
        logging.info(f"💾 BACKUP QUENTE: Snapshot WAL gerado com sucesso em: {backup_path}")
        return jsonify({
            "status": "Sucesso", 
            "msg": "Backup quente executado com sucesso.", 
            "path": backup_path
        })
    except Exception as e:
        logging.error(f"❌ BACKUP FALHOU: Erro crítico ao criar snapshot: {e}", exc_info=True)
        return jsonify({"status": "Erro", "msg": str(e)}), 500
