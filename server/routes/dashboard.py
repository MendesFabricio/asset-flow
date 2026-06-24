# server/routes/dashboard.py
from flask import Blueprint, jsonify, request, current_app # ⚡ Injetado current_app para escopo de thread
import sys
import os
import logging 
import threading
import time

# Ajuste para importar services da pasta pai
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from services import PortfolioService

dashboard_bp = Blueprint('dashboard', __name__)
service = PortfolioService()

# 🧠 MÁQUINA DE ESTADO GLOBAL: Monitora o progresso ativo por ativo no Yahoo Finance
FUNDAMENTALS_STATE = {
    "status": "idle",      # "idle" | "processing" | "success" | "error"
    "progress": 0,
    "total": 0,
    "message": "Sistema pronto."
}

def async_fundamentals_worker(flask_app):
    """🛠️ Thread Mestre: Executa a esteira pesada do Yahoo sem prender a requisição HTTP do usuário"""
    global FUNDAMENTALS_STATE
    with flask_app.app_context():
        try:
            logging.info("⏳ [BACKGROUND TASK] Esteira assíncrona de valuation e dividendos iniciada...")
            # Delega a carga ao serviço injetando o dicionário de estados concorrente
            result = service.update_fundamentals(state_dict=FUNDAMENTALS_STATE)
            
            if result.get("status") == "Sucesso":
                FUNDAMENTALS_STATE["status"] = "success"
                FUNDAMENTALS_STATE["message"] = result.get("msg", "Inteligência fundamentalista atualizada!")
            else:
                FUNDAMENTALS_STATE["status"] = "error"
                FUNDAMENTALS_STATE["message"] = result.get("msg", "Falha operacional no pipeline.")
        except Exception as e:
            logging.error(f"❌ Erro catastrófico interno na thread de fundamentos: {e}", exc_info=True)
            FUNDAMENTALS_STATE["status"] = "error"
            FUNDAMENTALS_STATE["message"] = f"Erro crítico: {str(e)}"
        finally:
            # Mantém o status de sucesso/erro na tela por 5 segundos para feedback visual e limpa
            time.sleep(5)
            if FUNDAMENTALS_STATE["status"] in ["success", "error"]:
                FUNDAMENTALS_STATE["status"] = "idle"
                FUNDAMENTALS_STATE["message"] = "Sistema pronto."

@dashboard_bp.route('/api/index', methods=['GET'])
def get_data():
    force = request.args.get('force') == 'true'
    if force:
        try:
            logging.info("⚡ Forçando atualização síncrona de preços via requisição do usuário...")
            service.update_prices()
            service.take_daily_snapshot()
        except Exception as e:
            logging.error(f"⚠️ Falha ao forçar atualização síncrona de preços: {e}")
        
    try:
        data = service.get_dashboard_data()
        return jsonify(data)
    except Exception as e:
        logging.error(f"❌ Erro catastrófico ao compilar dados do dashboard: {e}")
        return jsonify({"status": "Erro", "msg": "Não foi possível carregar os dados do painel."}), 500

@dashboard_bp.route('/api/history', methods=['GET'])
def get_history():
    try:
        data = service.get_history_data()
        return jsonify(data)
    except Exception as e:
        logging.error(f"❌ Erro ao buscar histórico patrimonial: {e}")
        return jsonify({"status": "Erro", "msg": "Erro interno ao carregar a timeline histórica."}), 500

@dashboard_bp.route('/api/health', methods=['GET'])
def health():
    return jsonify({
        "status": "running", 
        "db": "sqlite", 
        "container": os.environ.get('IS_DOCKER', 'false')
    })

@dashboard_bp.route('/api/fundamentals-status', methods=['GET'])
def get_fundamentals_status():
    """📡 ROTA DE CHECAGEM: O Next.js bate aqui repetidamente para ler o avanço da barra de progresso"""
    global FUNDAMENTALS_STATE
    return jsonify(FUNDAMENTALS_STATE)

@dashboard_bp.route('/api/update-fundamentals', methods=['POST'])
def trigger_fundamentals():
    global FUNDAMENTALS_STATE
    try:
        # Trava de segurança para impedir disparos concorrentes duplicados
        if FUNDAMENTALS_STATE["status"] == "processing":
            return jsonify({"status": "Aviso", "msg": "Uma varredura de fundamentos já está em execução."}), 409

        if request.is_json:
            request.get_json(silent=True) # Imuniza o parser contra payloads fantasmas nulos

        logging.info("📊 Inicializando barramento assíncrono de fundamentos...")
        FUNDAMENTALS_STATE["status"] = "processing"
        FUNDAMENTALS_STATE["progress"] = 0
        FUNDAMENTALS_STATE["total"] = 0
        FUNDAMENTALS_STATE["message"] = "Conectando ao Yahoo Finance..."

        # Dispara execução paralela e libera o Flask na hora com HTTP 202
        threading.Thread(
            target=async_fundamentals_worker,
            args=(current_app._get_current_object(),),
            daemon=True
        ).start()

        return jsonify({
            "status": "Sucesso", 
            "msg": "Cálculo de valuation e margens iniciado em segundo plano!"
        }), 202
    except Exception as e:
        logging.error(f"❌ Falha ao orquestrar agendamento de fundamentos: {e}", exc_info=True)
        FUNDAMENTALS_STATE["status"] = "error"
        return jsonify({"status": "Erro", "msg": str(e)}), 500

@dashboard_bp.route('/api/simulation', methods=['GET'])
def simulation():
    try:
        logging.info("🎲 Requisição recebida. Disparando projeções de Monte Carlo...")
        result = service.run_monte_carlo_simulation()
        return jsonify(result)
    except Exception as e:
        logging.error(f"❌ Erro ao processar simulação de Monte Carlo na rota: {e}")
        return jsonify({"status": "Erro", "msg": "Falha ao processar simulação estatística."}), 500
