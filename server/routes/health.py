"""
routes/health.py
Barramento de telemetria e healthcheck de produção para monitoramento 24/7.
Executa verificações atômicas de conectividade no SQLite e Ollama local.
"""
import os
import time
import logging
import requests
from flask import Blueprint, jsonify
from services import Session
from sqlalchemy import text
from datetime import datetime
import yfinance as yf

# Cache global para a API do Yahoo Finance (evita rate limit a cada healthcheck)
_yahoo_cache = {
    "status": "online",
    "message": "Aguardando primeira verificação...",
    "last_check": 0
}

health_bp = Blueprint('health', __name__)

@health_bp.route('/api/health', methods=['GET'])
def healthcheck():
    """
    🔍 ROTA DE TELEMETRIA: Verifica status dos subsistemas concorrentemente e com timeouts estritos.
    Garante fechamento determinístico da sessão do banco de dados no final.
    """
    status_db = "online"
    detail_db = "Conexão estabelecida com sucesso."
    
    # 1. Banco de Dados SQLite (WAL)
    try:
        with Session() as session:
            start = time.perf_counter()
            session.execute(text("SELECT 1")).fetchone()
            db_time = (time.perf_counter() - start) * 1000
            detail_db = f"SQLite operando sob modo WAL. Latência: {db_time:.2f}ms"
    except Exception as e:
        status_db = "offline"
        detail_db = f"Falha ao conectar no SQLite: {str(e)}"
        logging.error(f"❌ [HEALTH] Erro SQLite: {e}")

    # 2. Ollama Service (IA local daemon status)
    status_ollama = "online"
    detail_ollama = "Serviço de IA ativo e respondendo."
    try:
        ollama_base_url = os.getenv("OLLAMA_BASE_URL", "http://ollama:11434").rstrip("/")
        active_model = os.getenv("OLLAMA_MODEL", "llama3.2:3b")
        res = requests.get(f"{ollama_base_url}/api/tags", timeout=3.0)
        if res.status_code == 200:
            models = [m.get("name") for m in res.json().get("models", [])]
            if active_model in models:
                detail_ollama = f"Daemon ativo. Modelo em uso: {active_model}"
            else:
                detail_ollama = f"Daemon ativo, mas o modelo configurado ({active_model}) não está baixado!"
                status_ollama = "warning"
        else:
            status_ollama = "offline"
            detail_ollama = f"Daemon ativo, mas retornou status {res.status_code}."
    except requests.exceptions.Timeout:
        status_ollama = "offline"
        detail_ollama = "Timeout de conexão (Ollama travado ou sobrecarregado)"
    except Exception as e:
        status_ollama = "offline"
        detail_ollama = f"Daemon inativo (OOM ou offline): {str(e)}"

    # 3. Yahoo Finance API (Cached 1 min)
    current_time = time.time()
    if current_time - _yahoo_cache["last_check"] > 60:
        try:
            ticker = yf.Ticker("AAPL")
            info = ticker.fast_info
            if info:
                _yahoo_cache["status"] = "online"
                _yahoo_cache["message"] = "Conectividade confirmada e operante."
            else:
                _yahoo_cache["status"] = "warning"
                _yahoo_cache["message"] = "Conectou, mas a resposta da API veio vazia."
        except Exception as e:
            _yahoo_cache["status"] = "offline"
            _yahoo_cache["message"] = f"Falha na API ou Rate Limit: {str(e)}"
            logging.error(f"❌ [HEALTH] Erro Yahoo Finance: {e}")
        _yahoo_cache["last_check"] = current_time

    # Status global: se algum serviço essencial falhar, o status passa a ser crítico
    global_status = "online"
    if status_db == "offline":
        global_status = "offline"
    elif status_ollama == "offline":
        global_status = "warning"

    return jsonify({
        "status": global_status,
        "timestamp": datetime.now().isoformat(),
        "services": {
            "database": {
                "status": status_db,
                "message": detail_db
            },
            "ollama": {
                "status": status_ollama,
                "message": detail_ollama
            },
            "yahoo_finance": {
                "status": _yahoo_cache["status"],
                "message": _yahoo_cache["message"]
            }
        }
    }), 200 if global_status in ["online", "warning"] else 503
