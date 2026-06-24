import os
import threading
import time
import logging
from flask import Flask, jsonify
from flask_cors import CORS
from apscheduler.schedulers.background import BackgroundScheduler
from concurrent.futures import ThreadPoolExecutor, as_completed # ⚡ Motor de paralelismo para background

# Importação de Blueprints
from routes.dashboard import dashboard_bp
from routes.assets import assets_bp
from routes.news import news_bp
from routes.calendar import calendar_bp
from routes.alerts import alerts_bp
from routes.dividends import dividends_bp
from routes.maintenance import maintenance_bp
from services import PortfolioService
from utils.cvm_processor import CVMProcessor 
from routes.finance import finance_bp
from routes.market import market_bp, update_market_cache 

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

app = Flask(__name__)
CORS(app)

# 🧠 MÁQUINA DE ESTADO GLOBAL: Controla o progresso real da sincronia em segundo plano
SYNC_STATE = {
    "status": "idle",      # "idle" | "processing" | "success" | "error"
    "progress": 0,
    "total": 0,
    "message": "Sistema pronto."
}

@app.errorhandler(Exception)
def handle_global_exception(e):
    logging.error(f"💥 Erro crítico global interceptado: {str(e)}", exc_info=True)
    return jsonify({
        "status": "Erro",
        "msg": "Ocorreu um erro interno no servidor de dados do AssetFlow.",
        "details": str(e)
    }), 500

# Registro de Blueprints
app.register_blueprint(dashboard_bp)
app.register_blueprint(assets_bp)
app.register_blueprint(news_bp)
app.register_blueprint(calendar_bp)
app.register_blueprint(alerts_bp)
app.register_blueprint(dividends_bp)
app.register_blueprint(maintenance_bp)
app.register_blueprint(finance_bp, url_prefix='/api/finance')
app.register_blueprint(market_bp, url_prefix='/api/market')

service = PortfolioService()

# --- TRABALHADOR ASSÍNCRONO COM PARALELISMO MULTITHREAD ---

def async_sync_worker(flask_app):
    """🛠️ Thread Mestre: Executa FNET sequencial e paraleliza a esteira pesada de CSVs da CVM"""
    global SYNC_STATE
    
    try:
        logging.info("⏳ [BACKGROUND TASK] Iniciando esteira otimizada de relatórios...")
        
        # 1. Sincroniza FIIs (FNET)
        SYNC_STATE["message"] = "Sincronizando relatórios de FIIs na B3..."
        fnet_result = service.sync_reports_with_fnet() 
        logging.info(f"📊 [BACKGROUND TASK] FNET concluído: {fnet_result.get('msg')}")
        
        # 2. Coleta de Ativos (Ações CVM)
        from database.models import Session, Asset
        tickers_para_processar = []
        
        # Abre uma sessão curta apenas para ler os códigos brutos, evitando manter o banco preso
        with Session() as db_session:
            acoes_cvm = db_session.query(Asset).filter(Asset.cvm_code != None, Asset.cvm_code != "").all()
            # Convertemos para tipos primitivos (strings) para que as threads usem de forma isolada e segura
            tickers_para_processar = [(acao.ticker, acao.cvm_code) for acao in acoes_cvm]

        total_acoes = len(tickers_para_processar)
        if total_acoes == 0:
            SYNC_STATE["status"] = "success"
            SYNC_STATE["message"] = "Sincronização finalizada! Nenhuma ação CVM pendente."
            return

        # Atualiza o estado global para o front-end saber o tamanho do desafio
        SYNC_STATE["total"] = total_acoes
        SYNC_STATE["progress"] = 0
        SYNC_STATE["message"] = f"Aquecendo motores paralelos para {total_acoes} ações..."

        # ⚡ WORKER INTERNO PARALELO: Processa a leitura física do ZIP/CSV fora da thread principal
        def process_single_cvm_item(ticker, cvm_code):
            CVMProcessor.get_dashboard_data(cvm_code)
            return ticker

        count_cvm = 0
        # Dispara até 4 workers simultâneos (equilíbrio perfeito para não travar o disco do Docker)
        with ThreadPoolExecutor(max_workers=4) as executor:
            futures = {executor.submit(process_single_cvm_item, t, c): t for t, c in tickers_para_processar}
            
            for future in as_completed(futures):
                ticker_concluido = futures[future]
                try:
                    future.result() # Captura falhas se houverem dentro do worker
                    count_cvm += 1
                    # 📈 EVOLUÇÃO EM TEMPO REAL: Alimenta o estado do progresso
                    SYNC_STATE["progress"] = count_cvm
                    SYNC_STATE["message"] = f"Processado {ticker_concluido} ({count_cvm}/{total_acoes})"
                    logging.info(f"📊 [BACKGROUND TASK] Concluído em paralelo: {ticker_concluido}")
                except Exception as cell_err:
                    logging.error(f"⚠️ Erro ao processar papel {ticker_concluido} na thread: {cell_err}")

        # Sincronização concluída com sucesso total!
        SYNC_STATE["status"] = "success"
        SYNC_STATE["message"] = f"Sucesso! {total_acoes} ações e FIIs atualizados."
        logging.info("🏁 [BACKGROUND TASK] Sincronia paralela finalizada com sucesso total!")
        
        # Aguarda 5 segundos no estado de sucesso para o usuário ver a mensagem e limpa para "idle"
        time.sleep(5)
        if SYNC_STATE["status"] == "success":
            SYNC_STATE["status"] = "idle"
            SYNC_STATE["message"] = "Sistema pronto."

    except Exception as e:
        logging.error(f"❌ Erro catastrófico na esteira em background: {str(e)}", exc_info=True)
        SYNC_STATE["status"] = "error"
        SYNC_STATE["message"] = f"Falha na sincronização: {str(e)}"


# --- ROTAS DE SINCRONIZAÇÃO E LONG-POLLING ---

@app.route('/api/sync-status', methods=['GET'])
def get_sync_status():
    """📡 ROTA DE CHECAGEM: O front-end bate aqui repetidamente para ler o progresso real"""
    global SYNC_STATE
    return jsonify(SYNC_STATE)

@app.route('/api/sync-reports', methods=['POST'])
def sync_reports():
    global SYNC_STATE
    try:
        # 🛡️ TRAVA CONCORRENTE SÊNIOR: Impede o usuário de disparar duas esteiras ao mesmo tempo
        if SYNC_STATE["status"] == "processing":
            return jsonify({
                "status": "Aviso", 
                "msg": "Uma sincronização já está em andamento. Aguarde a conclusão."
            }), 409

        logging.info("🚀 Gatilho manual disparado. Resetando máquina de estados e iniciando threads...")
        
        # Prepara a máquina de estados
        SYNC_STATE["status"] = "processing"
        SYNC_STATE["progress"] = 0
        SYNC_STATE["total"] = 0
        SYNC_STATE["message"] = "Iniciando barramento de sincronização assíncrona..."

        threading.Thread(
            target=async_sync_worker, 
            args=(app._get_current_object() if hasattr(app, '_get_current_object') else app,), 
            daemon=True
        ).start()
        
        return jsonify({
            "status": "Sucesso", 
            "msg": "Processo de inteligência fundamentalista iniciado!"
        }), 202

    except Exception as e:
        logging.error(f"❌ Erro ao agendar a execução da sincronia: {str(e)}", exc_info=True)
        SYNC_STATE["status"] = "error"
        return jsonify({"status": "Erro", "msg": str(e)}), 500


# --- JOBS DE AGENDAMENTO ORQUESTRADO ---

def scheduled_update_prices():
    with app.app_context():
        try:
            logging.info("🕒 JOB 10m: Atualizando preços dos ativos e salvando snapshot...")
            service.update_prices()
            service.take_daily_snapshot()
        except Exception as e:
            logging.error(f"❌ Erro no Job de atualização de cotações da carteira: {e}", exc_info=True)

def scheduled_update_indices():
    with app.app_context():
        try:
            update_market_cache() 
        except Exception as e:
            logging.error(f"❌ Erro no Job de atualização de índices macro: {e}", exc_info=True)

def scheduled_dividends_check():
    with app.app_context():
        try:
            logging.info("📅 JOB DIÁRIO: Verificando Dividendos...")
            if hasattr(service, 'record_confirmed_dividends'):
                service.record_confirmed_dividends()
        except Exception as e:
            logging.error(f"❌ Erro no Job automático de rastreamento de dividendos: {e}", exc_info=True)

scheduler = BackgroundScheduler()
scheduler.add_job(func=scheduled_update_indices, trigger="interval", minutes=5, max_instances=1, misfire_grace_time=30)
scheduler.add_job(func=scheduled_update_prices, trigger="interval", minutes=10, max_instances=1, misfire_grace_time=60)
scheduler.add_job(func=scheduled_dividends_check, trigger="cron", hour=8, minute=0, max_instances=1, misfire_grace_time=3600)

if not scheduler.running:
    scheduler.start()

def initial_background_update():
    time.sleep(5) 
    logging.info("🚀 Boot: Rodando atualizações iniciais em thread paralela...")
    with app.app_context():
        try: update_market_cache()
        except Exception as e: logging.error(f"⚠️ Falha ao esquentar cache de índices macro no boot: {e}", exc_info=True)
        try: scheduled_update_prices()
        except Exception as e: logging.error(f"⚠️ Falha ao processar cotações automáticas no boot: {e}", exc_info=True)

if __name__ == '__main__':
    boot_thread = threading.Thread(target=initial_background_update)
    boot_thread.daemon = True 
    boot_thread.start()
    
    debug_mode = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(host='0.0.0.0', port=5328, debug=debug_mode, use_reloader=False)
