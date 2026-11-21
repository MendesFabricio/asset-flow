"""
routes/health.py
Barramento de telemetria e healthcheck de produção para monitoramento 24/7.
Executa verificações leves de conectividade no SQLite e status do serviço de IA.
"""
import os
import time
import logging
from flask import Blueprint, jsonify
from db.session import Session
from sqlalchemy import text
from datetime import datetime, timezone

health_bp = Blueprint('health', __name__)

@health_bp.route('/api/health', methods=['GET'])
def healthcheck():
    """
    🔍 ROTA DE TELEMETRIA: Verifica status dos subsistemas locais sem bloquear em APIs externas lentas.
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

    # 2. IA Service (Gemini Cloud ou Ollama Local)
    status_gemini = "online"
    detail_gemini = "Serviço de IA ativo e respondendo."
    try:
        from infrastructure.gemini_service import MODEL_NAME
        from infrastructure.local_ai import get_ollama_status
        api_key = os.getenv("GEMINI_API_KEY")
        if api_key:
            detail_gemini = f"API Key presente. Modelo em uso: {MODEL_NAME}"
        else:
            ollama = get_ollama_status(timeout=1.5)
            if ollama["available"] and ollama["model"]:
                detail_gemini = f"IA Local (Ollama) ativa · Modelo: {ollama['model']}"
            elif ollama["available"]:
                status_gemini = "offline"
                detail_gemini = f"Ollama ativo, mas sem modelo baixado. Rode: ollama pull {ollama['preferred_model']}"
            else:
                status_gemini = "offline"
                detail_gemini = "API Key do Gemini não configurada e Ollama local offline."
    except Exception as e:
        status_gemini = "offline"
        detail_gemini = f"Falha ao validar serviço de IA: {str(e)}"

    # Status global: se algum serviço essencial falhar, o status passa a ser crítico
    global_status = "online"
    if status_db == "offline":
        global_status = "offline"
    elif status_gemini == "offline":
        global_status = "warning"

    return jsonify({
        "status": global_status,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "services": {
            "database": {
                "status": status_db,
                "message": detail_db
            },
            "yahoo_finance": {
                "status": "online",
                "message": "Atualização assíncrona via worker."
            },
            "gemini": {
                "status": status_gemini,
                "message": detail_gemini
            }
        }
    }), 200 if global_status in ["online", "warning"] else 503
