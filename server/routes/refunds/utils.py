from datetime import datetime
from flask import g
from database.models import AuditLog, RefundConfig, safe_commit

def log_audit(session, table, reg_id, field, old_val, new_val):
    log = AuditLog(
        tabela_afetada=table,
        registro_id=reg_id,
        campo_alterado=field,
        valor_antigo=str(old_val) if old_val is not None else None,
        valor_novo=str(new_val) if new_val is not None else None,
        alterado_em=datetime.now()
    )
    session.add(log)

def get_config(session):
    config = session.query(RefundConfig).filter_by(user_id=g.user_id).first()
    if not config:
        config = RefundConfig(user_id=g.user_id, fechamento_dia=15, vencimento_dia=20)
        session.add(config)
        safe_commit(session)
    return config
