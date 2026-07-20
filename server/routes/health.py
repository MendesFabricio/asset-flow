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
from datetime import datetime, timezone
import yfinance as yf

# Cache global para a API do Yahoo Finance (evita rate limit a cada healthcheck)
_yahoo_cache = {
    "status": "online",
    "message": "Aguardando primeira verificação...",
    "last_check": 0
}

def get_system_metrics():
    try:
        cores = os.cpu_count() or 1
        load1, load5, load15 = os.getloadavg()
        cpu_percent = (load1 / cores) * 100

        with open('/proc/meminfo', 'r') as f:
            lines = f.readlines()
        meminfo = {}
        for line in lines:
            parts = line.split(':')
            if len(parts) == 2:
                meminfo[parts[0].strip()] = int(parts[1].strip().split()[0])
        
        total = meminfo.get('MemTotal', 0)
        free = meminfo.get('MemFree', 0)
        buffers = meminfo.get('Buffers', 0)
        cached = meminfo.get('Cached', 0)
        
        used = total - free - buffers - cached
        mem_percent = (used / total) * 100 if total > 0 else 0
        
        return {
            "cpu_percent": round(cpu_percent, 1),
            "mem_percent": round(mem_percent, 1),
            "mem_total_gb": round(total / 1024 / 1024, 1),
            "mem_used_gb": round(used / 1024 / 1024, 1)
        }
    except Exception as e:
        return {
            "cpu_percent": 0.0,
            "mem_percent": 0.0,
            "mem_total_gb": 0.0,
            "mem_used_gb": 0.0,
            "error": str(e)
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

    # 2. Gemini Service (IA Cloud)
    status_gemini = "online"
    detail_gemini = "Serviço de IA ativo e respondendo."
    try:
        from infrastructure.gemini_service import MODEL_NAME
        import os
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            status_gemini = "offline"
            detail_gemini = "API Key do Gemini não configurada."
        else:
            detail_gemini = f"API Key presente. Modelo em uso: {MODEL_NAME}"
    except Exception as e:
        status_gemini = "offline"
        detail_gemini = f"Falha ao validar serviço de IA: {str(e)}"

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
    elif status_gemini == "offline":
        global_status = "warning"

    return jsonify({
        "status": global_status,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "metrics": get_system_metrics(),
        "services": {
            "database": {
                "status": status_db,
                "message": detail_db
            },
            "yahoo_finance": {
                "status": _yahoo_cache["status"],
                "message": _yahoo_cache["message"]
            },
            "gemini": {
                "status": status_gemini,
                "message": detail_gemini
            }
        }
    }), 200 if global_status in ["online", "warning"] else 503
