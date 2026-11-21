from datetime import datetime
import logging
import time
from db.models import Session as DBSession, ScheduledJob, safe_commit


def _update_job_status(job_name: str, status: str, message: str = ""):
    """Atualiza o status do job no banco de dados."""
    try:
        with DBSession() as session:
            job = session.query(ScheduledJob).filter_by(name=job_name).first()
            if job:
                job.last_run_at = datetime.now()
                job.last_run_status = status
                job.last_run_message = message or ""
                job.updated_at = datetime.now()
                safe_commit(session)
    except Exception as e:
        logging.warning(f"⚠️ Não foi possível atualizar status do job {job_name}: {e}")


def _run_with_tracking(job_name: str, func, *args, **kwargs):
    """Wrapper que executa função, mede duração e atualiza status no banco."""
    _update_job_status(job_name, "running", "Executando...")
    t0 = time.perf_counter()
    try:
        func(*args, **kwargs)
        elapsed = time.perf_counter() - t0
        _update_job_status(job_name, "success", f"Executado com sucesso em {elapsed:.1f}s")
    except Exception as e:
        elapsed = time.perf_counter() - t0
        logging.error(f"❌ Erro no job {job_name} ({elapsed:.1f}s): {e}", exc_info=True)
        _update_job_status(job_name, "error", f"Erro ({elapsed:.1f}s): {str(e)[:220]}")
