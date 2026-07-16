from datetime import datetime
import logging
from database.models import Session as DBSession, ScheduledJob, safe_commit

def _update_job_status(job_name: str, status: str, message: str = ""):
    """Atualiza o status do job no banco de dados."""
    try:
        with DBSession() as session:
            job = session.query(ScheduledJob).filter_by(name=job_name).first()
            if job:
                job.last_run_at = datetime.utcnow()
                job.last_run_status = status
                job.last_run_message = message or ""
                job.updated_at = datetime.utcnow()
                safe_commit(session)
    except Exception as e:
        logging.warning(f"⚠️ Não foi possível atualizar status do job {job_name}: {e}")

def _run_with_tracking(job_name: str, func, *args, **kwargs):
    """Wrapper que executa função e atualiza status no banco."""
    _update_job_status(job_name, "running", "Executando...")
    try:
        func(*args, **kwargs)
        _update_job_status(job_name, "success", "Executado com sucesso")
    except Exception as e:
        logging.error(f"❌ Erro no job {job_name}: {e}", exc_info=True)
        _update_job_status(job_name, "error", str(e)[:250])
