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
from utils.cvm_processor import CVMProcessor # 👈 Importação necessária
from routes.finance import finance_bp
from routes.market import market_bp

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

# --- ROTA ATUALIZADA PARA SINCRONIZAÇÃO CVM E FNET ---
@app.route('/api/sync-reports', methods=['POST'])
def sync_reports():
    try:
        logging.info("🚀 Iniciando sincronia manual...")
        
        # 1. Sincroniza FIIs (FNET)
        fnet_result = service.sync_reports_with_fnet() 
        
        # 2. Sincroniza Ações (CVM)
        # IMPORTANTE: Buscamos direto do banco para evitar erros de dicionário
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

def scheduled_update():
    with app.app_context():
        try:
            logging.info("🔄 Iniciando manutenção automática...")
            service.update_prices()
            service.take_daily_snapshot()
            if hasattr(service, 'record_confirmed_dividends'):
                service.record_confirmed_dividends()
            logging.info("✅ Manutenção automática concluída.")
        except Exception as e:
            logging.error(f"❌ Erro no agendador: {e}")

# Configuração do Agendador
scheduler = BackgroundScheduler()
if not scheduler.running:
    scheduler.add_job(func=scheduled_update, trigger="interval", minutes=60)
    scheduler.start()

def initial_background_update():
    time.sleep(5) 
    scheduled_update()

if __name__ == '__main__':
    boot_thread = threading.Thread(target=initial_background_update)
    boot_thread.daemon = True 
    boot_thread.start()
    
    debug_mode = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(host='0.0.0.0', port=5328, debug=debug_mode, use_reloader=False)
