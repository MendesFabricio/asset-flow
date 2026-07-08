"""
server/worker.py
Processo worker isolado executando tarefas agendadas via APScheduler.
"""
import os
import sys
import logging
import requests

# Garante que o diretório pai esteja no sys.path para importações absolutas
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Configuração de Logs
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] (Worker) %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

# Inicializa o banco de dados
from database.models import init_db
init_db()

from apscheduler.schedulers.blocking import BlockingScheduler
from services import PortfolioService
from routes.market import update_market_cache
from routes.alerts_price import check_price_alerts

service = PortfolioService()

def scheduled_update_prices():
    try:
        logging.info("🕒 JOB 10m: Atualizando preços dos ativos e salvando snapshot...")
        service.update_prices()
        service.take_daily_snapshot()
    except Exception as e:
        logging.error(f"❌ Erro no Job de atualização de cotações da carteira: {e}", exc_info=True)

def scheduled_update_indices():
    try:
        update_market_cache()
        # Verifica alertas de preço a cada 5 minutos (junto com indices)
        fired = check_price_alerts()
        if fired:
            logging.info(f"🔔 {len(fired)} alerta(s) de preço disparado(s) neste ciclo.")
    except Exception as e:
        logging.error(f"❌ Erro no Job de atualização de índices macro: {e}", exc_info=True)

def scheduled_dividends_check():
    try:
        logging.info("📅 JOB DIÁRIO: Verificando Dividendos...")
        if hasattr(service, 'record_confirmed_dividends'):
            service.record_confirmed_dividends()
    except Exception as e:
        logging.error(f"❌ Erro no Job automático de rastreamento de dividendos: {e}", exc_info=True)

def scheduled_quant_warm():
    try:
        logging.info("🔥 JOB 30m: Pré-aquecendo métricas analíticas (Monte Carlo, Correlação, Risco, Dólar)...")
        service.get_usd_rate()
        service.run_monte_carlo_simulation()
        service.get_correlation_matrix()
        service.calculate_risk_metrics()
        service.calculate_efficient_frontier_points()
    except Exception as e:
        logging.error(f"❌ Erro ao pré-aquecer métricas analíticas: {e}", exc_info=True)

def scheduled_morning_brief_generation():
    try:
        logging.info("☕ JOB 07:00: Iniciando geração proativa do Morning Briefing...")
        url = "http://backend:5328/api/ai/morning-brief?force=true"
        try:
            res = requests.get(url, timeout=240)
            if res.status_code == 200:
                logging.info("✅ Morning Briefing proativo gerado e cacheado com sucesso!")
            else:
                logging.warning(f"⚠️ Resposta inesperada do backend na geração do Briefing (Status {res.status_code})")
        except Exception as conn_err:
            logging.warning(f"Tentando rota local alternativa: {conn_err}")
            url_local = "http://localhost:5328/api/ai/morning-brief?force=true"
            res_local = requests.get(url_local, timeout=240)
            if res_local.status_code == 200:
                logging.info("✅ Morning Briefing proativo gerado (local)!")
    except Exception as e:
        logging.error(f"❌ Erro crítico ao gerar Morning Briefing de madrugada: {e}", exc_info=True)

if __name__ == '__main__':
    logging.info("🚀 Iniciando Worker de Agendamento do AssetFlow Pro...")
    
    # Executa o aquecimento do cache e primeira sincronia no boot
    try:
        logging.info("🔥 Boot: Rodando atualizações iniciais e esquentando cache...")
        update_market_cache()
        scheduled_update_prices()
        scheduled_quant_warm()
        logging.info("✅ Cache warming concluído. Worker pronto para receber agendamentos!")
    except Exception as e:
        logging.error(f"⚠️ Falha no boot/warming do worker: {e}", exc_info=True)

    scheduler = BlockingScheduler()
    scheduler.add_job(func=scheduled_update_indices, trigger="interval", minutes=5, max_instances=1, misfire_grace_time=30)
    scheduler.add_job(func=scheduled_update_prices, trigger="interval", minutes=10, max_instances=1, misfire_grace_time=60)
    scheduler.add_job(func=scheduled_quant_warm, trigger="interval", minutes=30, max_instances=1, misfire_grace_time=300)
    scheduler.add_job(func=scheduled_dividends_check, trigger="cron", hour=8, minute=0, max_instances=1, misfire_grace_time=3600)

    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        logging.info("👋 Worker encerrado graciosamente.")
