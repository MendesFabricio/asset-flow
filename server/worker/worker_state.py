import logging
import threading
from datetime import datetime
from db.models import Session as DBSession, ScheduledJob, safe_commit
from worker_jobs import JOB_REGISTRY
from worker_core import _run_with_tracking
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

def seed_jobs_if_empty():
    """Popula a tabela scheduled_jobs se estiver vazia ou com itens ausentes."""
    try:
        with DBSession() as session:
            seeded_any = False
            for name, info in JOB_REGISTRY.items():
                existing = session.query(ScheduledJob).filter_by(name=name).first()
                if not existing:
                    new_job = ScheduledJob(
                        name=name,
                        description=info["description"],
                        job_type=info["default_type"],
                        cron_expression=info.get("default_cron"),
                        interval_minutes=info.get("default_interval"),
                        is_active=True,
                        last_run_at=datetime.utcnow(),
                        last_run_status="idle",
                        last_run_message="Aguardando primeira execução"
                    )
                    session.add(new_job)
                    seeded_any = True
            if seeded_any:
                safe_commit(session)
                logging.info("✅ Scheduled jobs populados/sincronizados com sucesso!")
    except Exception as e:
        logging.warning(f"⚠️ Erro ao popular scheduled jobs: {e}")

def sync_scheduler_state(scheduler):
    """Sincroniza o estado do scheduler com as modificações e requisições no banco de dados."""
    try:
        with DBSession() as session:
            # 1. Trata execuções manuais pendentes
            pending_jobs = session.query(ScheduledJob).filter_by(last_run_status="pending_manual").all()
            for job in pending_jobs:
                if job.name in JOB_REGISTRY:
                    logging.info(f"⚡ Executando job {job.name} manualmente solicitado...")
                    job.last_run_status = "running"
                    job.last_run_message = "Executando (manual)..."
                    job.updated_at = datetime.utcnow()
                    safe_commit(session)
                    
                    func = JOB_REGISTRY[job.name]["func"]
                    t = threading.Thread(target=_run_with_tracking, args=(job.name, func), daemon=True)
                    t.start()

            # 2. Sincroniza agendamentos ativos/inativos e mudanças de horários
            jobs = session.query(ScheduledJob).all()
            for job in jobs:
                if job.name not in JOB_REGISTRY:
                    continue
                
                info = JOB_REGISTRY[job.name]
                existing_job = scheduler.get_job(job.name)

                if job.is_active:
                    if job.job_type == "cron" and job.cron_expression:
                        desired_trigger = CronTrigger.from_crontab(job.cron_expression)
                    elif job.job_type == "interval" and job.interval_minutes:
                        desired_trigger = IntervalTrigger(minutes=job.interval_minutes)
                    else:
                        desired_trigger = None

                    if not desired_trigger:
                        continue

                    if not existing_job:
                        scheduler.add_job(
                            func=info["func"],
                            trigger=desired_trigger,
                            id=job.name,
                            name=job.name,
                            max_instances=1,
                            misfire_grace_time=300
                        )
                        logging.info(f"📅 Job agendado dinamicamente: {job.name} ({job.job_type})")
                    else:
                        trigger_changed = False
                        if job.job_type == "cron":
                            if str(desired_trigger) != str(existing_job.trigger):
                                trigger_changed = True
                        elif job.job_type == "interval":
                            if str(desired_trigger) != str(existing_job.trigger):
                                trigger_changed = True

                        if trigger_changed:
                            scheduler.reschedule_job(
                                job.name,
                                trigger=desired_trigger
                            )
                            logging.info(f"🔄 Agendamento do job {job.name} atualizado dinamicamente!")
                else:
                    if existing_job:
                        scheduler.remove_job(job.name)
                        logging.info(f"⏸️ Job desativado removido do agendador: {job.name}")
    except Exception as e:
        logging.error(f"❌ Erro na sincronização periódica do scheduler: {e}", exc_info=True)

def build_scheduler_jobs(scheduler):
    """Lê jobs do banco e adiciona no APScheduler."""
    try:
        with DBSession() as session:
            jobs = session.query(ScheduledJob).filter_by(is_active=True).all()
            for job in jobs:
                if job.name not in JOB_REGISTRY:
                    continue
                info = JOB_REGISTRY[job.name]
                
                try:
                    scheduler.remove_job(job.name)
                except Exception:
                    pass
                
                if job.job_type == "cron" and job.cron_expression:
                    scheduler.add_job(
                        func=info["func"],
                        trigger=CronTrigger.from_crontab(job.cron_expression),
                        id=job.name,
                        name=job.name,
                        max_instances=1,
                        misfire_grace_time=300
                    )
                elif job.job_type == "interval" and job.interval_minutes:
                    scheduler.add_job(
                        func=info["func"],
                        trigger="interval",
                        id=job.name,
                        name=job.name,
                        minutes=job.interval_minutes,
                        max_instances=1,
                        misfire_grace_time=300
                    )
                logging.info(f"📅 Job agendado: {job.name} ({job.job_type})")
    except Exception as e:
        logging.error(f"❌ Erro ao carregar jobs do banco: {e}", exc_info=True)
