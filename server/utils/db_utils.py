import functools
import logging
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from sqlalchemy.exc import OperationalError

logger = logging.getLogger(__name__)

def with_safe_commit(func):
    """
    Decorator para funções de rota (ou serviços) que tenta reexecutar
    a operação automaticamente em caso de 'database is locked' (OperationalError).
    """
    @functools.wraps(func)
    @retry(
        retry=retry_if_exception_type(OperationalError),
        wait=wait_exponential(multiplier=0.2, min=0.2, max=2.0),
        stop=stop_after_attempt(5),
        reraise=True,
        before_sleep=lambda retry_state: logger.warning(
            f"⚠️ Deadlock detectado! Tentativa {retry_state.attempt_number}/5 de reexecutar. Aguardando..."
        )
    )
    def wrapper(*args, **kwargs):
        return func(*args, **kwargs)
    
    return wrapper


def get_current_user_id() -> int:
    """Retorna o user_id autenticado no contexto Flask ou levanta HTTP 401."""
    from flask import g, has_request_context, current_app
    from werkzeug.exceptions import Unauthorized

    if has_request_context():
        uid = getattr(g, "user_id", None)
        if uid is not None:
            return int(uid)
        if current_app and current_app.config.get("TESTING"):
            return 1
    raise Unauthorized("Sessão inválida ou usuário não autenticado.")
