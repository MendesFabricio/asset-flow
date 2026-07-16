from flask import jsonify, request
from . import refunds_bp
from database.models import Session, safe_commit
from schemas import RefundConfigUpdate
from .utils import get_config, log_audit

@refunds_bp.route('/config', methods=['GET', 'POST'])
def handle_config():
    with Session() as db:
        config = get_config(db)
        if request.method == 'POST':
            try:
                body = RefundConfigUpdate(**request.json or {})
            except Exception as e:
                return jsonify({"status": "Erro", "msg": str(e)}), 400

            fechamento = body.fechamento_dia
            vencimento = body.vencimento_dia
                
            log_audit(db, "refund_configs", config.id, "fechamento_dia", config.fechamento_dia, fechamento)
            log_audit(db, "refund_configs", config.id, "vencimento_dia", config.vencimento_dia, vencimento)
            
            config.fechamento_dia = fechamento
            config.vencimento_dia = vencimento
            safe_commit(db)
            return jsonify({"msg": "Configurações salvas!"})
            
        return jsonify({
            "id": config.id,
            "fechamento_dia": config.fechamento_dia,
            "vencimento_dia": config.vencimento_dia
        })
