import os
import time
import atexit
import threading
import logging
from flask import Flask, jsonify
from flask_cors import CORS
# O scheduler automático foi removido e isolado no worker.py
from concurrent.futures import ThreadPoolExecutor, as_completed  # ⚡ Motor de paralelismo para background

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
from routes.refunds import refunds_bp
from routes.market import market_bp
from routes.alerts_price import price_alerts_bp
from routes.health import health_bp
from routes.sync_stream import sync_stream_bp
from routes.simulation import simulation_bp
from routes.ai import ai_bp
from routes.quant_analysis import quant_bp
from routes.credit_cards import cards_bp
from routes.fixed_income import fixed_income_bp
from routes.auth import auth_bp



logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

from database.models import init_db, DatabaseStateProxy, get_sync_state_db
init_db()

import decimal
from flask.json.provider import DefaultJSONProvider

class CustomJSONProvider(DefaultJSONProvider):
    def default(self, o):
        if isinstance(o, decimal.Decimal):
            return float(o)
        return super().default(o)

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY")
if not app.config["SECRET_KEY"]:
    logging.warning("⚠️ SECRET_KEY não definida no ambiente! Utilizando chave provisória e randômica para esta sessão.")
    import secrets
    app.config["SECRET_KEY"] = secrets.token_hex(32)

app.json = CustomJSONProvider(app)
allowed_origins = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
CORS(app, resources={r"/api/*": {"origins": allowed_origins}})

# 🧠 MÁQUINA DE ESTADO PERSISTENTE: Controla o progresso real da sincronia em SQLite (stateless)
SYNC_STATE = DatabaseStateProxy("cvm_sync")
_SYNC_LOCK = threading.Lock()

# 🚀 STARTUP RECOVERY: Reseta estados "processing" órfãos do banco que ficaram presos após reinício do container.
# Sem esse reset, o frontend fica com o spinner girando para sempre após um restart, porque não há lock ativo
# mas o banco ainda lembra o estado "processing" da sessão anterior.
def _reset_orphaned_sync_states():
    from database.models import update_sync_state_db
    idle_state = {"status": "idle", "progress": 0, "total": 0, "message": "Sistema pronto."}
    for key in ("cvm_sync", "yahoo_sync"):
        try:
            current = get_sync_state_db(key)
            if current.get("status") == "processing":
                logging.warning(f"⚠️ [STARTUP] Estado órfão '{key}' detectado como 'processing' sem lock ativo. Resetando para idle.")
                update_sync_state_db(key, **idle_state)
        except Exception as e:
            logging.warning(f"⚠️ [STARTUP] Falha ao checar/resetar estado orphão '{key}': {e}")

_reset_orphaned_sync_states()

def _update_sync_state(**kwargs):
    """Atualiza o SYNC_STATE de forma persistente."""
    SYNC_STATE.update(kwargs)

def _get_sync_state() -> dict:
    """Retorna o status atual da sincronia."""
    return get_sync_state_db("cvm_sync")

@app.before_request
def require_authentication():
    from flask import request, g
    # Bypasses OPTIONS preflight, health check and auth endpoints
    if request.method == "OPTIONS" or request.path in ["/api/health", "/api/auth/login", "/api/auth/register", "/api/auth/logout"]:
        return
        
    auth_header = request.headers.get("Authorization")
    token = None
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        
    if not token:
        token = request.cookies.get("assetflow_session")
        
    if not token:
        return jsonify({"status": "Erro", "msg": "Token de autenticação ausente."}), 401
        
    from routes.auth import verify_session_token
    user_data = verify_session_token(token)
    if not user_data:
        return jsonify({"status": "Erro", "msg": "Sessão inválida ou expirada. Efetue login novamente."}), 401
        
    g.user_id = user_data["user_id"]
    g.username = user_data["username"]

@app.errorhandler(Exception)
def handle_global_exception(e):
    from flask import request
    logging.error(f"💥 Erro crítico global interceptado em {request.method} {request.url}: {str(e)}", exc_info=True)
    return jsonify({
        "status": "Erro",
        "msg": "Ocorreu um erro interno no servidor de dados do AssetFlow."
    }), 500

# Registro de Blueprints
app.register_blueprint(auth_bp)
app.register_blueprint(dashboard_bp)
app.register_blueprint(assets_bp)
app.register_blueprint(news_bp)
app.register_blueprint(calendar_bp)
app.register_blueprint(alerts_bp)
app.register_blueprint(dividends_bp)
app.register_blueprint(maintenance_bp)
app.register_blueprint(refunds_bp, url_prefix='/api/refunds')
app.register_blueprint(market_bp, url_prefix='/api/market')
app.register_blueprint(price_alerts_bp)
app.register_blueprint(health_bp)
app.register_blueprint(sync_stream_bp)
app.register_blueprint(simulation_bp)
app.register_blueprint(ai_bp)
app.register_blueprint(quant_bp)
app.register_blueprint(cards_bp)
app.register_blueprint(fixed_income_bp)



service = PortfolioService()

# --- GRACEFUL SHUTDOWN: Fecha pools HTTP de forma determinística ---

@atexit.register
def cleanup_http_sessions():
    """🔌 FIX 1.5: Fecha pools de HTTP na saída do processo, evitando CLOSE_WAIT no kernel."""
    try:
        from crawlers.b3_fnet import B3FnetCrawler
        if B3FnetCrawler._session:
            B3FnetCrawler._session.close()
            logging.info("🔌 Pool HTTP FNET fechado graciosamente.")
    except Exception:
        pass
    try:
        from crawlers.cvm_enet import CVMEnetCrawler
        if CVMEnetCrawler._session:
            CVMEnetCrawler._session.close()
            logging.info("🔌 Pool HTTP CVM ENET fechado graciosamente.")
    except Exception:
        pass


# --- TRABALHADOR ASSÍNCRONO COM PARALELISMO MULTITHREAD ---

def async_sync_worker(flask_app):
    """🛠️ Thread Mestre: Executa FNET sequencial e paraleliza a esteira pesada de CSVs da CVM"""

    try:
        logging.info("⏳ [BACKGROUND TASK] Iniciando esteira otimizada de relatórios...")

        # 1. Sincroniza FIIs (FNET)
        _update_sync_state(message="Sincronizando relatórios de FIIs na B3...")
        
        # 🔒 CORREÇÃO CRÍTICA: Abre a sessão thread-safe exigida pelo método do processador
        from services import Session as ScopedSession
        with ScopedSession() as db_session:
            fnet_result = service.sync_reports_with_fnet(db_session)
            
        logging.info(f"📊 [BACKGROUND TASK] FNET concluído: {fnet_result.get('msg')}")

        # 2. Coleta de Ativos (Ações CVM)
        # 🔒 FIX 1.3: Importa o scoped_session do services (thread-safe via threading.local)
        # em vez do sessionmaker simples de database.models que era compartilhado entre threads.
        from services import Session as ScopedSession
        from database.models import Asset
        tickers_para_processar = []

        # Abre uma sessão curta apenas para ler os códigos brutos, evitando manter o banco preso
        with ScopedSession() as db_session:
            acoes_cvm = db_session.query(Asset).filter(
                Asset.cvm_code != None, Asset.cvm_code != ""
            ).all()
            # Converte para tipos primitivos para que as threads usem de forma isolada e segura
            tickers_para_processar = [(acao.ticker, acao.cvm_code) for acao in acoes_cvm]

        total_acoes = len(tickers_para_processar)
        if total_acoes == 0:
            _update_sync_state(status="success", message="Sincronização finalizada! Nenhuma ação CVM pendente.")
            return

        # Atualiza o estado global para o front-end saber o tamanho do desafio
        _update_sync_state(
            total=total_acoes,
            progress=0,
            message=f"Aquecendo motores paralelos para {total_acoes} ações..."
        )

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
                    future.result()  # Captura falhas dentro do worker
                    count_cvm += 1
                    # 📈 EVOLUÇÃO EM TEMPO REAL: Alimenta o estado do progresso
                    _update_sync_state(
                        progress=count_cvm,
                        message=f"Processado {ticker_concluido} ({count_cvm}/{total_acoes})"
                    )
                    logging.info(f"📊 [BACKGROUND TASK] Concluído em paralelo: {ticker_concluido}")
                except Exception as cell_err:
                    logging.error(f"⚠️ Erro ao processar papel {ticker_concluido} na thread: {cell_err}")

        # Sincronização concluída com sucesso total!
        _update_sync_state(
            status="success",
            message=f"Sucesso! {total_acoes} ações e FIIs atualizados."
        )
        logging.info("🏁 [BACKGROUND TASK] Sincronia paralela finalizada com sucesso total!")

        # 🔄 RESET AUTOMÁTICO: Agenda a volta ao estado 'idle' após 5 segundos
        def auto_reset():
            time.sleep(5.0)
            _update_sync_state(status="idle", progress=0, total=0, message="Sistema pronto.")
        threading.Thread(target=auto_reset, daemon=True).start()

    except Exception as e:
        logging.error(f"❌ Erro catastrófico na esteira em background: {str(e)}", exc_info=True)
        _update_sync_state(status="error", message=f"Falha na sincronização: {str(e)}")

        # 🔄 RESET AUTOMÁTICO EM CASO DE ERRO: Agenda a volta ao estado 'idle' após 5 segundos
        def auto_reset_err():
            time.sleep(5.0)
            _update_sync_state(status="idle", progress=0, total=0, message="Sistema pronto.")
        threading.Thread(target=auto_reset_err, daemon=True).start()


# --- ROTAS DE SINCRONIZAÇÃO E LONG-POLLING ---

@app.route('/api/sync-status', methods=['GET'])
def get_sync_status():
    """📡 ROTA DE CHECAGEM: O front-end bate aqui repetidamente para ler o progresso real"""
    return jsonify(_get_sync_state())

@app.route('/api/sync-reports', methods=['POST'])
def sync_reports():
    is_locked = _SYNC_LOCK.locked()
    db_status = SYNC_STATE.get("status")
    
    if db_status == "processing" and not is_locked:
        logging.warning("⚠️ Estado órfão de processamento no CVM detectado (sem lock ativo). Forçando reset para idle.")
        SYNC_STATE.update({"status": "idle", "message": "Sistema pronto."})
        db_status = "idle"

    if not _SYNC_LOCK.acquire(blocking=False):
        return jsonify({
            "status": "Aviso",
            "msg": "Uma sincronização já está em andamento. Aguarde a conclusão."
        }), 409
        
    if db_status == "processing":
        _SYNC_LOCK.release()
        return jsonify({
            "status": "Aviso",
            "msg": "Uma sincronização já está em andamento no banco. Aguarde a conclusão."
        }), 409

    try:
        # Prepara a máquina de estados no banco
        SYNC_STATE.update({
            "status": "processing",
            "progress": 0,
            "total": 0,
            "message": "Iniciando barramento de sincronização assíncrona..."
        })

        logging.info("🚀 Gatilho manual disparado. Resetando máquina de estados e iniciando threads...")

        def run_worker_and_release(flask_app):
            try:
                async_sync_worker(flask_app)
            finally:
                if _SYNC_LOCK.locked():
                    _SYNC_LOCK.release()

        threading.Thread(
            target=run_worker_and_release,
            args=(app._get_current_object() if hasattr(app, '_get_current_object') else app,),
            daemon=True
        ).start()

        return jsonify({
            "status": "Sucesso",
            "msg": "Processo de inteligência fundamentalista iniciado!"
        }), 202

    except Exception as e:
        logging.error(f"❌ Erro ao agendar a execução da sincronia: {str(e)}", exc_info=True)
        if _SYNC_LOCK.locked():
            _SYNC_LOCK.release()
        _update_sync_state(status="error")
        return jsonify({"status": "Erro", "msg": str(e)}), 500


# --- AGENDAMENTOS E TAREFAS DE BOOT DE BACKGROUND REMOVIDOS ---
# Todas as tarefas agendadas e aquecimento de cache foram migrados para o worker.py


if __name__ == '__main__':
    debug_mode = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(host='0.0.0.0', port=5328, debug=debug_mode, use_reloader=False)
