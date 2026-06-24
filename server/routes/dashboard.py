# server/routes/dashboard.py
from flask import Blueprint, jsonify, request
import sys
import os
import logging # ⚡ Injetado o módulo de logs oficial

# Ajuste para importar services da pasta pai
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from services import PortfolioService

dashboard_bp = Blueprint('dashboard', __name__)
# 🧼 REUTILIÇÃO SÊNIOR: Uma única instância em memória para todas as rotas do blueprint
service = PortfolioService()

@dashboard_bp.route('/api/index', methods=['GET'])
def get_data():
    force = request.args.get('force') == 'true'
    if force:
        try:
            logging.info("⚡ Forçando atualização síncrona de preços via requisição do usuário...")
            service.update_prices()
            service.take_daily_snapshot()
        except Exception as e:
            # 🛡️ Corrigido: Nunca engula exceções com 'pass' silencioso. Guarde no log!
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

@dashboard_bp.route('/api/update-fundamentals', methods=['POST'])
def trigger_fundamentals():
    # 🛡️ DEFESA PREVENTIVA: Se o cliente enviar um JSON corrompido ou payload lixo, a rota não quebra
    try:
        if request.is_json and request.json:
            logging.info(f"📊 Payload preventivo recebido na esteira fundamentalista: {request.json}")
            
        logging.info("📊 Executando gatilho manual para varredura fundamentalista...")
        # 🧼 OTIMIZAÇÃO: Removida a re-instanciação redundante. Usa o service global do topo.
        result = service.update_fundamentals()
        return jsonify(result)
    except Exception as e:
        logging.error(f"❌ Erro fatal na rota de atualização de fundamentos: {e}")
        return jsonify({"status": "Erro", "msg": "Falha na execução do pipeline fundamentalista."}), 500

@dashboard_bp.route('/api/simulation', methods=['GET'])
def simulation():
    try:
        logging.info("🎲 Requisição recebida. Disparando projeções de Monte Carlo...")
        # 🧼 OTIMIZAÇÃO: Economia de memória usando a instância global limpa
        result = service.run_monte_carlo_simulation()
        return jsonify(result)
    except Exception as e:
        logging.error(f"❌ Erro ao processar simulação de Monte Carlo na rota: {e}")
        return jsonify({"status": "Erro", "msg": "Falha ao processar simulação estatística."}), 500
