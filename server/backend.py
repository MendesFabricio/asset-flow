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
# 👇 ALTERAÇÃO 1: Importamos a função de cache do market.py
from routes.market import market_bp, update_market_cache 

logging.basicConfig(level=logging.INFO)
app = Flask(__name__)
CORS(app)

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

# --- ROTA MANTIDA: SINCRONIZAÇÃO CVM E FNET ---
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
            # Pegamos todos os ativos que são Ação e possuem cvm_code preenchido
            acoes_cvm = db_session.query(Asset).filter(
                Asset.cvm_code != None,
                Asset.cvm_code != ""
            ).all()

            for acao in acoes_cvm:
                logging.info(f"📊 Processando CVM: {acao.ticker} ({acao.cvm_code})")
                # Chama o motor para baixar o ZIP e gerar a análise
                CVMProcessor.get_dashboard_data(acao.cvm_code)
                count_cvm += 1
            
            db_session.commit()
        finally:
            db_session.close()

        return jsonify({
            "status": "Sucesso", 
            "msg": f"FIIs: {fnet_result.get('msg')}. CVM: {count_cvm} ações atualizadas."
        }), 200

    except Exception as e:
        logging.error(f"❌ Erro na sincronia: {str(e)}")
        return jsonify({"status": "Erro", "msg": str(e)}), 500

# --- NOVOS JOBS DE AGENDAMENTO (SUBSTITUI O ANTIGO scheduled_update) ---

def scheduled_update_prices():
    """Atualiza preços da carteira a cada 30 minutos"""
    with app.app_context():
        try:
            logging.info("🕒 JOB 30m: Atualizando preços dos ativos...")
            service.update_prices()
            service.take_daily_snapshot()
        except Exception as e:
            logging.error(f"❌ Erro Update Prices: {e}")

def scheduled_update_indices():
    """Atualiza IBOV/IFIX na memória (Cache) a cada 5 minutos"""
    with app.app_context():
        try:
            update_market_cache() # Função importada do market.py
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

# 1. Job Rápido: Indices de Mercado (5 min)
scheduler.add_job(func=scheduled_update_indices, trigger="interval", minutes=5)

# 2. Job Médio: Preços da Carteira (30 min) - Antes era 60, otimizado para 30
scheduler.add_job(func=scheduled_update_prices, trigger="interval", minutes=5)

# 3. Job Lento: Dividendos (Todo dia as 08:00)
scheduler.add_job(func=scheduled_dividends_check, trigger="cron", hour=8, minute=0)

if not scheduler.running:
    scheduler.start()

def initial_background_update():
    """Roda tudo uma vez ao ligar o servidor para não esperar os timers"""
    time.sleep(5) 
    logging.info("🚀 Boot: Rodando atualizações iniciais...")
    
    # Atualiza Cache de Mercado Imediatamente
    with app.app_context():
        try: update_market_cache()
        except: pass
        
        # Atualiza Preços Imediatamente
        try: scheduled_update_prices()
        except: pass

if __name__ == '__main__':
    boot_thread = threading.Thread(target=initial_background_update)
    boot_thread.daemon = True 
    boot_thread.start()
    
    debug_mode = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(host='0.0.0.0', port=5328, debug=debug_mode, use_reloader=False)
