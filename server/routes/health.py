"""
routes/health.py
Barramento de telemetria e healthcheck de produção para monitoramento 24/7.
Executa verificações atômicas de conectividade no SQLite, Yahoo Finance e Ollama local.
"""
import os
import time
import logging
import requests
from flask import Blueprint, jsonify
from services import Session
from sqlalchemy import text
from datetime import datetime

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
        session = Session()
        start = time.perf_counter()
        session.execute(text("SELECT 1")).fetchone()
        db_time = (time.perf_counter() - start) * 1000
        detail_db = f"SQLite operando sob modo WAL. Latência: {db_time:.2f}ms"
    except Exception as e:
        status_db = "offline"
        detail_db = f"Falha ao conectar no SQLite: {str(e)}"
        logging.error(f"❌ [HEALTH] Erro SQLite: {e}")
    finally:
        Session.remove()  # 🔒 Fechamento determinístico para liberar conexões do pool

    # 2. Yahoo Finance API Connectivity
    status_yf = "online"
    detail_yf = "API de cotações disponível."
    try:
        # GET request leve para testar conectividade com Yahoo Finance com User-Agent legítimo
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}
        res = requests.get("https://finance.yahoo.com", headers=headers, timeout=3.0)
        if res.status_code >= 500:
            status_yf = "offline"
            detail_yf = f"Serviço Yahoo Finance instável (Status: {res.status_code})"
    except requests.exceptions.Timeout:
        status_yf = "offline"
        detail_yf = "Timeout de conexão (limite de 3.0s excedido)"
    except Exception as e:
        status_yf = "offline"
        detail_yf = f"Falha de rede com Yahoo: {str(e)}"

    # 3. Ollama Service (IA local daemon status)
    status_ollama = "online"
    detail_ollama = "Serviço de IA ativo e respondendo."
    try:
        # Endpoint de tags retorna todos os modelos disponíveis sem processar prompts pesados
        res = requests.get("http://ollama:11434/api/tags", timeout=3.0)
        if res.status_code == 200:
            models = [m.get("name") for m in res.json().get("models", [])]
            detail_ollama = f"Daemon ativo. Modelos disponíveis: {', '.join(models) if models else 'Nenhum'}"
        else:
            status_ollama = "offline"
            detail_ollama = f"Daemon ativo, mas retornou status {res.status_code}."
    except requests.exceptions.Timeout:
        status_ollama = "offline"
        detail_ollama = "Timeout de conexão (Ollama travado ou sobrecarregado)"
    except Exception as e:
        status_ollama = "offline"
        detail_ollama = f"Daemon inativo (OOM ou offline): {str(e)}"

    # Status global: se algum serviço essencial falhar, o status passa a ser crítico
    global_status = "online"
    if status_db == "offline" or status_yf == "offline":
        global_status = "offline"  # Se BD ou Yahoo caírem, a carteira está inoperante
    elif status_ollama == "offline":
        global_status = "warning"  # Se apenas a IA cair, mantemos online com aviso

    return jsonify({
        "status": global_status,
        "timestamp": datetime.now().isoformat(),
        "services": {
            "database": {
                "status": status_db,
                "message": detail_db
            },
            "yahoo_finance": {
                "status": status_yf,
                "message": detail_yf
            },
            "ollama": {
                "status": status_ollama,
                "message": detail_ollama
            }
        }
    }), 200 if global_status in ["online", "warning"] else 503
