"""
server/worker.py
Processo worker isolado executando tarefas agendadas via APScheduler.
"""
import os
import sys
import logging
import requests
import time
import threading
from datetime import datetime
import sentry_sdk

from sentry_sdk.integrations.logging import LoggingIntegration

sentry_logging = LoggingIntegration(
    level=logging.INFO,        # Captura INFO e superior como breadcrumbs
    event_level=logging.ERROR  # Envia APENAS ERROS como eventos para o GlitchTip
)

_sentry_dsn = os.environ.get("SENTRY_DSN")
if _sentry_dsn:
    sentry_sdk.init(
        dsn=_sentry_dsn,
        traces_sample_rate=0.01,
        auto_session_tracking=False,
        environment=os.environ.get("ENVIRONMENT", "production"),
        release=os.environ.get("APP_RELEASE", "assetflow-worker@1.0.0"),
        integrations=[sentry_logging],
    )

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] (Worker) %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

from database.models import init_db
try:
    init_db()
except Exception as e:
    logging.error(f"❌ Falha crítica na inicialização do banco de dados no worker: {e}", exc_info=True)

from apscheduler.schedulers.blocking import BlockingScheduler
from services import PortfolioService
from routes.market import update_market_cache
from routes.alerts_price import check_price_alerts
from database.models import Session as DBSession, ScheduledJob, safe_commit, Position
from routes.simulation import _run_morning_brief_bg, _build_morning_brief_context
from domain.quant.helpers import get_risk_free_rate

service = PortfolioService()

HEARTBEAT_PATH = os.environ.get("WORKER_HEARTBEAT_PATH", "/app/data/worker_heartbeat.txt")
HEARTBEAT_INTERVAL = 30

def _heartbeat_writer():
    while True:
        try:
            os.makedirs(os.path.dirname(HEARTBEAT_PATH), exist_ok=True)
            with open(HEARTBEAT_PATH, "w") as f:
                f.write(str(time.time()))
        except Exception:
            pass
        time.sleep(HEARTBEAT_INTERVAL)

threading.Thread(target=_heartbeat_writer, daemon=True).start()

# --- JOB WRAPPERS ---

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

# --- JOB FUNCTIONS ---

def scheduled_update_prices():
    _run_with_tracking("scheduled_update_prices", _do_update_prices)

def _do_update_prices():
    logging.info("🕒 JOB 10m: Atualizando preços dos ativos...")
    service.update_prices()

def _do_daily_snapshot():
    logging.info("📸 JOB DIÁRIO: Salvando snapshot do portfólio...")
    service.take_daily_snapshot()

def scheduled_daily_snapshot():
    _run_with_tracking("scheduled_daily_snapshot", _do_daily_snapshot)

def _do_daily_snapshot():
    logging.info("📸 JOB DIÁRIO: Salvando snapshot do portfólio...")
    service.take_daily_snapshot()

def scheduled_update_indices():
    _run_with_tracking("scheduled_update_indices", _do_update_indices)

def _do_update_indices():
    update_market_cache()
    fired = check_price_alerts()
    if fired:
        logging.info(f"🔔 {len(fired)} alerta(s) de preço disparado(s) neste ciclo.")

def scheduled_dividends_check():
    _run_with_tracking("scheduled_dividends_check", _do_dividends_check)

def _do_dividends_check():
    logging.info("📅 JOB DIÁRIO: Verificando Dividendos...")
    if hasattr(service, 'record_confirmed_dividends'):
        service.record_confirmed_dividends()

def scheduled_quant_warm():
    _run_with_tracking("scheduled_quant_warm", _do_quant_warm)

def _do_quant_warm():
    logging.info("🔥 JOB 30m: Pré-aquecendo métricas analíticas...")
    service.get_usd_rate()
    service.run_monte_carlo_simulation()
    service.get_correlation_matrix()
    service.calculate_risk_metrics()
    service.calculate_efficient_frontier_points()

def scheduled_morning_brief_generation():
    _run_with_tracking("scheduled_morning_brief_generation", _do_morning_brief)

def _do_morning_brief():
    logging.info("☕ JOB 07:00: Gerando Morning Briefing...")
    try:
        from flask import Flask
        from database.models import Session as DBSession
        app = Flask(__name__)
        with app.app_context():
            from flask import g
            with DBSession() as session:
                user_ids = [r[0] for r in session.query(Position.user_id).distinct().all()]
                for uid in user_ids:
                    try:
                        cache_key = f"morning_brief_{uid}"
                        selic = get_risk_free_rate()
                        dolar_rate = service.get_usd_rate()
                        context = _build_morning_brief_context(uid, dolar_rate, selic)
                        _run_morning_brief_bg(uid, context, cache_key)
                    except Exception as e:
                        logging.warning(f"⚠️ [BRIEF] Falha ao gerar brief para usuário {uid}: {e}")
    except Exception as e:
        logging.error(f"❌ [BRIEF] Falha geral no job de Morning Brief: {e}", exc_info=True)

JOB_REGISTRY = {
    "scheduled_update_indices": {
        "func": scheduled_update_indices,
        "description": "Atualiza índices de mercado e verifica alertas de preço",
        "default_type": "interval",
        "default_interval": 5,
    },
    "scheduled_update_prices": {
        "func": scheduled_update_prices,
        "description": "Atualiza preços de ativos",
        "default_type": "interval",
        "default_interval": 10,
    },
    "scheduled_daily_snapshot": {
        "func": scheduled_daily_snapshot,
        "description": "Salva snapshot diário do portfólio",
        "default_type": "cron",
        "default_cron": "0 23 * * *",
    },
    "scheduled_quant_warm": {
        "func": scheduled_quant_warm,
        "description": "Pré-aquece cache quantitativo: USD rate, Monte Carlo, correlação, risco, fronteira eficiente",
        "default_type": "interval",
        "default_interval": 30,
    },
    "scheduled_dividends_check": {
        "func": scheduled_dividends_check,
        "description": "Registra dividendos confirmados do dia",
        "default_type": "cron",
        "default_cron": "0 8 * * *",
    },
    "scheduled_morning_brief_generation": {
        "func": scheduled_morning_brief_generation,
        "description": "Gera Morning Briefing proativo",
        "default_type": "cron",
        "default_cron": "0 7 * * *",
    },
}

def _seed_jobs_if_empty():
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

def _sync_scheduler_state():
    """Sincroniza o estado do scheduler com as modificações e requisições no banco de dados."""
    try:
        with DBSession() as session:
            # 1. Trata execuções manuais pendentes
            pending_jobs = session.query(ScheduledJob).filter_by(last_run_status="pending_manual").all()
            for job in pending_jobs:
                if job.name in JOB_REGISTRY:
                    logging.info(f"⚡ Executando job {job.name} manualmente solicitado...")
                    # Atualiza para running no banco antes de disparar a thread
                    job.last_run_status = "running"
                    job.last_run_message = "Executando (manual)..."
                    job.updated_at = datetime.utcnow()
                    safe_commit(session)
                    
                    # Dispara em uma thread separada para não bloquear o loop do scheduler
                    func = JOB_REGISTRY[job.name]["func"]
                    t = threading.Thread(target=_run_with_tracking, args=(job.name, func), daemon=True)
                    t.start()

            # 2. Sincroniza agendamentos ativos/inativos e mudanças de horários
            from apscheduler.triggers.cron import CronTrigger
            from apscheduler.triggers.interval import IntervalTrigger

            jobs = session.query(ScheduledJob).all()
            for job in jobs:
                if job.name not in JOB_REGISTRY:
                    continue
                
                info = JOB_REGISTRY[job.name]
                existing_job = scheduler.get_job(job.name)

                if job.is_active:
                    # Determina o trigger desejado
                    if job.job_type == "cron" and job.cron_expression:
                        desired_trigger = CronTrigger.from_crontab(job.cron_expression)
                    elif job.job_type == "interval" and job.interval_minutes:
                        desired_trigger = IntervalTrigger(minutes=job.interval_minutes)
                    else:
                        desired_trigger = None

                    if not desired_trigger:
                        continue

                    if not existing_job:
                        # Não agendado, mas está ativo no banco -> Adiciona
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
                        # Já agendado -> Verifica se o trigger mudou
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
                    # Inativo no banco -> Remove se estiver agendado
                    if existing_job:
                        scheduler.remove_job(job.name)
                        logging.info(f"⏸️ Job desativado removido do agendador: {job.name}")
    except Exception as e:
        logging.error(f"❌ Erro na sincronização periódica do scheduler: {e}", exc_info=True)

def _build_scheduler_jobs(scheduler):
    """Lê jobs do banco e adiciona no APScheduler."""
    try:
        from apscheduler.triggers.cron import CronTrigger
        with DBSession() as session:
            jobs = session.query(ScheduledJob).filter_by(is_active=True).all()
            for job in jobs:
                if job.name not in JOB_REGISTRY:
                    continue
                info = JOB_REGISTRY[job.name]
                
                # Remove job existente se houver
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

if __name__ == '__main__':
    logging.info("🚀 Iniciando Worker de Agendamento do AssetFlow Pro...")
    
    _seed_jobs_if_empty()
    
    scheduler = BlockingScheduler()
    _build_scheduler_jobs(scheduler)
    
    # Adiciona a tarefa periódica de sincronização
    scheduler.add_job(
        func=_sync_scheduler_state,
        trigger="interval",
        seconds=10,
        id="sys_sync_scheduler_state",
        name="sys_sync_scheduler_state",
        max_instances=1,
        misfire_grace_time=5
    )
    
    # Executa o aquecimento do cache e primeira sincronia no boot
    try:
        logging.info("🔥 Boot: Rodando atualizações iniciais e esquentando cache...")
        update_market_cache()
        _do_update_prices()
        _do_quant_warm()
        logging.info("✅ Cache warming concluído. Worker pronto para receber agendamentos!")
    except Exception as e:
        logging.error(f"⚠️ Falha no boot/warming do worker: {e}", exc_info=True)

    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        logging.info("👋 Worker encerrado graciosamente.")
