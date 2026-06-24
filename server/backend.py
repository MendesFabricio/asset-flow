import os
import threading
import time
import logging
from flask import Flask, jsonify
from flask_cors import CORS
from apscheduler.schedulers.background import BackgroundScheduler

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

# Configuração refinada de logs para exibir timestamp de forma profissional
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

app = Flask(__name__)
CORS(app)

# 🛡️ MANIPULADOR GLOBAL DE ERROS
@app.errorhandler(Exception)
def handle_global_exception(e):
    """Captura qualquer exceção não tratada nas rotas e responde em formato JSON estruturado"""
    logging.error(f"💥 Erro crítico global interceptado: {str(e)}", exc_info=True)
    return jsonify({
        "status": "Erro",
        "msg": "Ocorreu um erro interno no servidor de dados do AssetFlow.",
        "details": str(e)
    }), 500

# Registro de Rotas
app.register_blueprint(dashboard_bp)
app.register_blueprint(assets_bp)
app.register_blueprint(news_bp)
app.register_blueprint(calendar_bp)
app.register_blueprint(alerts_bp)
app.register_blueprint(dividends_bp)
app.register_blueprint(maintenance_bp)
app.register_blueprint(finance_bp, url_prefix='/api/finance')
app.register_blueprint(market_bp, url_prefix='/api/market')

# Instância única do serviço
service = PortfolioService()

# --- ROTA: SINCRONIZAÇÃO CVM E FNET ---
@app.route('/api/sync-reports', methods=['POST'])
def sync_reports():
    try:
        logging.info("🚀 Iniciando sincronia manual de relatórios...")
        
        # 1. Sincroniza FIIs (FNET)
        fnet_result = service.sync_reports_with_fnet() 
        
        # 2. Sincroniza Ações (CVM)
        from database.models import Session, Asset
        count_cvm = 0
        
        # ⚡ CONTEXT MANAGER INJETADO: Protege a sessão do banco. Se o CVMProcessor demorar ou 
        # cair no meio do loop, a transação sofre rollback automático e a conexão é liberada.
        with Session() as db_session:
            acoes_cvm = db_session.query(Asset).filter(
                Asset.cvm_code != None,
                Asset.cvm_code != ""
            ).all()

            for acao in acoes_cvm:
                logging.info(f"📊 Processando CVM: {acao.ticker} ({acao.cvm_code})")
                CVMProcessor.get_dashboard_data(acao.cvm_code)
                count_cvm += 1
            
            db_session.commit()

        return jsonify({
            "status": "Sucesso", 
            "msg": f"FIIs: {fnet_result.get('msg')}. CVM: {count_cvm} ações atualizadas."
        }), 200

    except Exception as e:
        logging.error(f"❌ Erro grave detectado na esteira de sincronia de relatórios: {str(e)}", exc_info=True)
        return jsonify({"status": "Erro", "msg": str(e)}), 500

# --- JOBS DE AGENDAMENTO ORQUESTRADO ---

def scheduled_update_prices():
    """⚡ Atualiza preços da carteira a cada 10 minutos de forma eficiente"""
    with app.app_context():
        try:
            logging.info("🕒 JOB 10m: Atualizando preços dos ativos e salvando snapshot...")
            service.update_prices()
            service.take_daily_snapshot()
        except Exception as e:
            # 🔍 TRACEBACK COMPLETO: exc_info=True injeta a linha exata do bug no log do Docker
            logging.error(f"❌ Erro no Job de atualização de cotações da carteira: {e}", exc_info=True)

def scheduled_update_indices():
    """Atualiza IBOV/IFIX na memória (Cache) a cada 5 minutos"""
    with app.app_context():
        try:
            update_market_cache() 
        except Exception as e:
            logging.error(f"❌ Erro no Job de atualização de índices macro: {e}", exc_info=True)

def scheduled_dividends_check():
    """Verifica dividendos confirmados uma vez por dia"""
    with app.app_context():
        try:
            logging.info("📅 JOB DIÁRIO: Verificando Dividendos...")
            if hasattr(service, 'record_confirmed_dividends'):
                service.record_confirmed_dividends()
        except Exception as e:
            logging.error(f"❌ Erro no Job automático de rastreamento de dividendos: {e}", exc_info=True)

# Configuração do Agendador
scheduler = BackgroundScheduler()

# ⚡ CALIBRAÇÃO SÊNIOR CONTRA CONCORRÊNCIA:
# - max_instances=1: Garante que se o Yahoo travar por mais de 10 min, uma segunda instância IDÊNTICA do Job não será disparada.
# - misfire_grace_time: Dá uma tolerância de segundos caso o servidor sofra lag ou reinicie bem na hora exata do agendamento.
scheduler.add_job(func=scheduled_update_indices, trigger="interval", minutes=5, max_instances=1, misfire_grace_time=30)
scheduler.add_job(func=scheduled_update_prices, trigger="interval", minutes=10, max_instances=1, misfire_grace_time=60)
scheduler.add_job(func=scheduled_dividends_check, trigger="cron", hour=8, minute=0, max_instances=1, misfire_grace_time=3600)

if not scheduler.running:
    scheduler.start()

def initial_background_update():
    """Execução em background pós-inicialização para popular dados de imediato no boot"""
    time.sleep(5) 
    logging.info("🚀 Boot: Rodando atualizações iniciais em thread paralela...")
    
    with app.app_context():
        # 🧼 REMOVIDO BARE EXCEPT: Erros na inicialização agora geram alertas claros nos logs para auditoria
        try: 
            update_market_cache()
        except Exception as e:
            logging.error(f"⚠️ Falha ao esquentar cache de índices macro no boot: {e}", exc_info=True)
            
        try: 
            scheduled_update_prices()
        except Exception as e:
            logging.error(f"⚠️ Falha ao processar cotações automáticas no boot: {e}", exc_info=True)

if __name__ == '__main__':
    boot_thread = threading.Thread(target=initial_background_update)
    boot_thread.daemon = True 
    boot_thread.start()
    
    debug_mode = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(host='0.0.0.0', port=5328, debug=debug_mode, use_reloader=False)
