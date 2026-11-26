from flask import g
from db.models import RefundConfig, safe_commit


def log_audit(session, table, reg_id, field, old_val, new_val):
    """No-op: a tabela AuditLog (write-only, nunca lida) foi removida. Mantida para compatibilidade das rotas."""
    return None


def get_config(session):
    config = session.query(RefundConfig).filter_by(user_id=g.user_id).first()
    if not config:
        config = RefundConfig(user_id=g.user_id, fechamento_dia=15, vencimento_dia=20)
        session.add(config)
        safe_commit(session)
    return config
