import os
import atexit
import logging
import decimal

from flask import Flask, jsonify, request, g
from flask_cors import CORS
from flask.json.provider import DefaultJSONProvider
from werkzeug.middleware.proxy_fix import ProxyFix

# Importações de Infraestrutura e Persistência
from db.models import init_db, DatabaseStateProxy, get_sync_state_db, update_sync_state_db
from db.session import Session


# Importações dos Blueprints
from routes.dashboard import dashboard_bp
from routes.assets import assets_bp
from routes.news import news_bp
from routes.calendar import calendar_bp
from routes.alerts import alerts_bp
from routes.dividends import dividends_bp
from routes.maintenance import maintenance_bp
from routes.refunds import refunds_bp
from routes.market import market_bp
from routes.alerts_price import price_alerts_bp
from routes.health import health_bp
from routes.sync_stream import sync_stream_bp
from routes.simulation import simulation_bp
from routes.ai import ai_bp
from routes.quant_analysis import quant_bp
from routes.fixed_income import fixed_income_bp
from routes.auth import auth_bp, verify_session_token
from routes.ocr_import import ocr_import_bp
from infrastructure.assets_icon import assets_icon_bp
from routes.scheduler import scheduler_bp
from routes.tax import tax_bp
from routes.portfolio import portfolio_bp
from routes.valuation import valuation_bp
from routes.signals_v2 import signals_v2_bp

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

# 🧠 MÁQUINA DE ESTADO PERSISTENTE
SYNC_STATE = DatabaseStateProxy("cvm_sync")

class CustomJSONProvider(DefaultJSONProvider):
    def default(self, o):
        if isinstance(o, decimal.Decimal):
            return float(o)
        return super().default(o)

def _reset_orphaned_sync_states():
    """Reseta estados 'processing' órfãos do banco presos após reinício do container."""
    idle_state = {"status": "idle", "progress": 0, "total": 0, "message": "Sistema pronto."}
    for key in ("cvm_sync", "yahoo_sync", "radar_sync"):
        try:
            current = get_sync_state_db(key)
            if current.get("status") == "processing":
                logging.warning(f"⚠️ [STARTUP] Estado órfão '{key}' detectado como 'processing'. Resetando para idle.")
                update_sync_state_db(key, **idle_state)
        except Exception as e:
            logging.warning(f"⚠️ [STARTUP] Falha ao resetar estado órfão '{key}': {e}")

def create_app(config_object=None) -> Flask:
    """Fábrica de Aplicação Flask (Application Factory Pattern)."""

    # 1. Inicialização do Banco de Dados
    try:
        init_db()
        logging.info("✅ Banco de dados inicializado com sucesso.")
    except Exception as e:
        logging.error(f"❌ Falha na inicialização do banco: {e}", exc_info=True)

    _reset_orphaned_sync_states()

    # 3. Criação e Configuração da Instância Flask
    app = Flask(__name__)
    default_dev_secret = "asset_flow_dev_secret_key_default_value_change_in_prod"
    secret_key = os.environ.get("SECRET_KEY") or default_dev_secret
    is_prod = os.environ.get("ENVIRONMENT", "").strip().lower() == "production"
    is_testing = bool((config_object or {}).get("TESTING") or app.config.get("TESTING"))
    if is_prod and secret_key == default_dev_secret and not is_testing:
        raise RuntimeError("SECRET_KEY de produção ausente ou igual ao valor padrão de desenvolvimento.")
    app.config["SECRET_KEY"] = secret_key
    app.config["MAX_CONTENT_LENGTH"] = 25 * 1024 * 1024  # 25 MB upload limit
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
    if secret_key == default_dev_secret:
        logging.warning("⚠️ SECRET_KEY não definida no ambiente! Utilizando chave padrão de desenvolvimento.")

    if config_object:
        app.config.update(config_object)

    app.json = CustomJSONProvider(app)
    allowed_origins = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
    CORS(app, resources={r"/api/*": {"origins": allowed_origins}})

    # 4. Context Teardown & Request Handlers
    @app.teardown_appcontext
    def shutdown_session(exception=None):
        Session.remove()

    @app.before_request
    def require_authentication():
        logging.info(f"📥 {request.method} {request.path} - IP: {request.remote_addr}")
        if app.config.get("TESTING"):
            g.user_id = 1
            g.username = "test_user"
            return

        if request.method == "OPTIONS" or request.path in ["/api/health", "/api/auth/login", "/api/auth/register", "/api/auth/logout"]:
            return
        if request.method == "GET" and request.path.startswith("/api/assets/icon/"):
            return
            
        auth_header = request.headers.get("Authorization")
        token = None
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
        if not token:
            token = request.cookies.get("assetflow_session")
            
        if not token:
            return jsonify({"status": "Erro", "msg": "Token de autenticação ausente."}), 401
            
        user_data = verify_session_token(token)
        if not user_data:
            return jsonify({"status": "Erro", "msg": "Sessão inválida ou expirada. Efetue login novamente."}), 401

        if user_data.get("_verified_user"):
            g.current_user_payload = user_data["_verified_user"]
        else:
            from db.models import User
            with Session() as session:
                user_exists = session.query(User).filter_by(id=user_data["user_id"]).first()
                if not user_exists:
                    return jsonify({"status": "Erro", "msg": "Sessão expirada ou usuário não existe no sistema."}), 401
                g.current_user_payload = {
                    "id": user_exists.id,
                    "username": user_exists.username,
                    "created_at": user_exists.created_at.isoformat() if user_exists.created_at else None,
                }

        g.user_id = user_data["user_id"]
        g.username = user_data["username"]

    @app.after_request
    def add_security_and_cache_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        connect_src = (
            "connect-src 'self'; "
            if os.environ.get("ENVIRONMENT", "").strip().lower() == "production"
            else "connect-src 'self' http://localhost:5328 http://127.0.0.1:5328; "
        )
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' https://raw.githubusercontent.com data:; "
            f"{connect_src}"
            "font-src 'self' data:; "
            "frame-ancestors 'none';"
        )
        
        if request.path.startswith("/api/assets/icon/"):
            response.headers["Cache-Control"] = "public, max-age=86400"
        elif request.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
            
        return response

    @app.errorhandler(Exception)
    def handle_global_exception(e):
        from werkzeug.exceptions import HTTPException
        if isinstance(e, HTTPException):
            return e
        logging.error(f"💥 Erro crítico global em {request.method} {request.url}: {str(e)}", exc_info=True)
        return jsonify({"status": "Erro", "msg": "Ocorreu um erro interno no servidor de dados do AssetFlow."}), 500

    # 5. Registro de Blueprints
    logging.info("🔧 Registrando blueprints...")
    app.register_blueprint(auth_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(assets_bp)
    app.register_blueprint(assets_icon_bp)
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
    app.register_blueprint(fixed_income_bp)
    app.register_blueprint(scheduler_bp, url_prefix='/api/scheduler')
    app.register_blueprint(ocr_import_bp)
    app.register_blueprint(tax_bp)
    app.register_blueprint(portfolio_bp)
    app.register_blueprint(valuation_bp)
    app.register_blueprint(signals_v2_bp)
    logging.info("✅ Todos os blueprints registrados com sucesso.")

    return app

# Instância padrão em escopo de módulo para servidores WSGI (Gunicorn: `backend:app`)
app = create_app()

@atexit.register
def cleanup_http_sessions():
    """Fecha pools HTTP na saída do processo."""
    try:
        from crawlers.b3_fnet import B3FnetCrawler
        if B3FnetCrawler._session:
            B3FnetCrawler._session.close()
    except Exception:
        pass
    try:
        from crawlers.cvm_enet import CVMEnetCrawler
        if CVMEnetCrawler._session:
            CVMEnetCrawler._session.close()
    except Exception:
        pass

if __name__ == '__main__':
    debug_mode = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(host='0.0.0.0', port=5328, debug=debug_mode, use_reloader=False)
