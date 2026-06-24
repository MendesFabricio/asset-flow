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

logging.basicConfig(level=logging.INFO)
app = Flask(__name__)
CORS(app)

# 🛡️ MANIPULADOR GLOBAL DE ERROS (Check no Relatório de Auditoria)
@app.errorhandler(Exception)
def handle_global_exception(e):
    """Captura qualquer exceção não tratada nas rotas e responde em formato JSON estruturado"""
    logging.error(f"💥 Erro crítico global interceptado: {str(e)}")
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
        logging.info("🚀 Iniciando sincronia manual...")
        
        # 1. Sincroniza FIIs (FNET)
        fnet_result = service.sync_reports_with_fnet() 
        
        # 2. Sincroniza Ações (CVM)
        from database.models import Session, Asset
        db_session = Session()
        count_cvm = 0
        
        try:
            acoes_cvm = db_session.query(Asset).filter(
                Asset.cvm_code != None,
                Asset.cvm_code != ""
            ).all()

            for acao in acoes_cvm:
                logging.info(f"📊 Processando CVM: {acao.ticker} ({acao.cvm_code})")
                CVMProcessor.get_dashboard_data(acao.cvm_code)
                count_cvm += 1
            
            db_session.commit()
        finally:
            db_session.close()

        return jsonify({
            "status": "Sucesso", 
            "msg": f"FIIs: {fnet_result.get('msg')}. CVM: {count_cvm} ações updated."
        }), 200

    except Exception as e:
        logging.error(f"❌ Erro na sincronia: {str(e)}")
        return jsonify({"status": "Erro", "msg": str(e)}), 500

# --- JOBS DE AGENDAMENTO ---

def scheduled_update_prices():
    """⚡ Atualiza preços da carteira a cada 10 minutos de forma eficiente"""
    with app.app_context():
        try:
            logging.info("🕒 JOB 10m: Atualizando preços dos ativos e salvando snapshot...")
            service.update_prices()
            service.take_daily_snapshot()
        except Exception as e:
            logging.error(f"❌ Erro Update Prices: {e}")

def scheduled_update_indices():
    """Atualiza IBOV/IFIX na memória (Cache) a cada 5 minutes"""
    with app.app_context():
        try:
            update_market_cache() 
        except Exception as e:
            logging.error(f"❌ Erro Update Indices: {e}")

def scheduled_dividends_check():
    """Verifica dividendos confirmados uma vez por dia"""
    with app.app_context():
        try:
            logging.info("📅 JOB DIÁRIO: Verificando Dividendos...")
            if hasattr(service, 'record_confirmed_dividends'):
                service.record_confirmed_dividends()
        except Exception as e:
            logging.error(f"❌ Erro Dividendos: {e}")

# Configuração do Agendador
scheduler = BackgroundScheduler()

# 1. Job Rápido: Índices de Mercado (Cache rápido - 5 min)
scheduler.add_job(func=scheduled_update_indices, trigger="interval", minutes=5)

# 2. Job Médio: Preços da Carteira (⏱️ Corrigido de 5 para 10 minutos nativos)
scheduler.add_job(func=scheduled_update_prices, trigger="interval", minutes=10)

# 3. Job Lento: Agenda de Dividendos (Cron executado pontualmente às 08:00)
scheduler.add_job(func=scheduled_dividends_check, trigger="cron", hour=8, minute=0)

if not scheduler.running:
    scheduler.start()

def initial_background_update():
    """Execução em background pós-inicialização para popular dados de imediato no boot"""
    time.sleep(5) 
    logging.info("🚀 Boot: Rodando atualizações iniciais em thread paralela...")
    
    with app.app_context():
        try: update_market_cache()
        except: pass
        
        try: scheduled_update_prices()
        except: pass

if __name__ == '__main__':
    boot_thread = threading.Thread(target=initial_background_update)
    boot_thread.daemon = True 
    boot_thread.start()
    
    debug_mode = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(host='0.0.0.0', port=5328, debug=debug_mode, use_reloader=False)
