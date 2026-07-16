"""
server/worker.py
Processo worker isolado executando tarefas agendadas via APScheduler.
"""
import os
import sys
import logging
import time
import threading
import sentry_sdk
from sentry_sdk.integrations.logging import LoggingIntegration

sentry_logging = LoggingIntegration(
    level=logging.INFO,
    event_level=logging.ERROR
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

from db.models import init_db
try:
    init_db()
except Exception as e:
    logging.error(f"❌ Falha crítica na inicialização do banco de dados no worker: {e}", exc_info=True)

from apscheduler.schedulers.blocking import BlockingScheduler
from worker_state import seed_jobs_if_empty, sync_scheduler_state, build_scheduler_jobs

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

if __name__ == '__main__':
    logging.info("🚀 Iniciando Worker de Agendamento do AssetFlow Pro...")
    
    seed_jobs_if_empty()
    
    scheduler = BlockingScheduler()
    build_scheduler_jobs(scheduler)
    
    # Adiciona a tarefa periódica de sincronização
    scheduler.add_job(
        func=lambda: sync_scheduler_state(scheduler),
        trigger="interval",
        seconds=10,
        id="sys_sync_scheduler_state",
        name="sys_sync_scheduler_state",
        max_instances=1,
        misfire_grace_time=5
    )
    
    # Executa o aquecimento do cache e primeira sincronia no boot
    try:
        from worker_jobs import _do_update_prices, _do_quant_warm
        from routes.market import update_market_cache
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
