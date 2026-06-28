"""
routes/simulation.py
Endpoints para simulações financeiras institucionais, otimizações quantitativas
(Markowitz, Paridade de Risco), exposição setorial e relatórios analíticos de IA (Morning Brief).
"""
import time
import logging
import requests
import json
from flask import Blueprint, jsonify
from services import PortfolioService
from database.models import Session, Asset, Position, MarketData
from domain.quant_engine import get_risk_free_rate, _to_yf_ticker
from infrastructure.ollama_service import OLLAMA_URL, MODEL_NAME

simulation_bp = Blueprint('simulation', __name__)
service = PortfolioService()

# Cache local simples de 4 horas para o Morning Brief gerado pela IA (evita sobrecarga no Mini-PC)
_BRIEF_CACHE = {
    "data": None,
    "last_updated": 0.0
}

@simulation_bp.route('/api/simulation/optimize', methods=['GET'])
def optimize_portfolio():
    """📈 Rota de Fronteira Eficiente: Retorna alocação de Sharpe Máximo (Markowitz)"""
    try:
        res = service.calculate_markowitz_optimization()
        return jsonify(res)
    except Exception as e:
        logging.error(f"❌ Erro na simulação de Markowitz: {e}", exc_info=True)
        return jsonify({"status": "Erro", "msg": str(e)}), 500

@simulation_bp.route('/api/simulation/risk-parity', methods=['GET'])
def risk_parity_portfolio():
    """⚖️ Rota de Paridade de Risco: Sugere pesos baseados em volatilidade individual e covariância"""
    try:
        res = service.calculate_risk_parity()
        return jsonify(res)
    except Exception as e:
        logging.error(f"❌ Erro na simulação de Paridade de Risco: {e}", exc_info=True)
        return jsonify({"status": "Erro", "msg": str(e)}), 500

@simulation_bp.route('/api/simulation/exposure', methods=['GET'])
def sector_exposure():
    """🌳 Rota de Exposição Setorial: Formato de árvore (Treemap) com alertas de concentração"""
    try:
        res = service.calculate_sector_exposure()
        return jsonify(res)
    except Exception as e:
        logging.error(f"❌ Erro ao obter exposição setorial: {e}", exc_info=True)
        return jsonify({"status": "Erro", "msg": str(e)}), 500

@simulation_bp.route('/api/dividends/forecast', methods=['GET'])
def dividends_forecast():
    """📅 Rota Preditiva de Proventos: Projeção de fluxo de caixa de proventos para 12 meses"""
    try:
        res = service.calculate_dividend_forecast()
        return jsonify(res)
    except Exception as e:
        logging.error(f"❌ Erro ao computar fluxo preditivo de dividendos: {e}", exc_info=True)
        return jsonify({"status": "Erro", "msg": str(e)}), 500

@simulation_bp.route('/api/market/brief', methods=['GET'])
def morning_brief():
    """
    ☕ Rota de Briefing Matinal: Combina dados de fechamento, Selic e portfólio real,
    instruindo o Ollama a emitir um sumário estratégico em JSON via Chain of Thought.
    """
    global _BRIEF_CACHE
    now = time.time()
    
    # 1. Retorna do cache se estiver válido (expiração de 4 horas)
    if _BRIEF_CACHE["data"] and (now - _BRIEF_CACHE["last_updated"]) < 14400:
        return jsonify(_BRIEF_CACHE["data"])

    session = Session()
    try:
        selic = get_risk_free_rate()
        
        # Coleta as maiores posições da carteira
        positions = (
            session.query(Position)
            .filter(Position.quantity > 0)
            .all()
        )
        
        holdings = []
        dolar_rate = service.get_usd_rate()
        
        for pos in positions:
            if not pos.asset:
                continue
            mdata = pos.asset.market_data[0] if pos.asset.market_data else None
            price = float(mdata.price or 0) if mdata else float(pos.average_price or 0)
            fator = dolar_rate if pos.asset.currency == 'USD' else 1.0
            val = float(pos.quantity) * price * fator
            if val > 0:
                holdings.append((pos.asset.ticker.upper(), val))
                
        # Ordena pelas maiores posições
        holdings.sort(key=lambda x: x[1], reverse=True)
        top_holdings = holdings[:3]
        holdings_text = "\n".join([f"- {ticker}: R$ {value:.2f}" for ticker, value in top_holdings])
        
        # Constrói o Prompt econômico contextualizado
        prompt = (
            f"Você é um economista-chefe e gestor de portfólio senior.\n"
            f"Elabore um briefing de mercado matinal de 1 parágrafo focado no risco destas 3 maiores posições da carteira do investidor:\n"
            f"{holdings_text or 'Nenhuma posição ativa no momento.'}\n\n"
            f"Cenário macroeconômico atual:\n"
            f"- Taxa Básica de Juros (Selic): {selic * 100:.2f}%\n"
            f"- Cotação do Dólar (USD/BRL): R$ {dolar_rate:.2f}\n\n"
            f"Regras estritas:\n"
            f"1. Foque a análise de alocação de risco exclusivamente no contexto destas posições.\n"
            f"2. NUNCA mencione conselhos macro generalistas.\n"
            f"3. Responda estritamente em formato JSON contendo as chaves exatas:\n"
            f"   - 'rationale': Cadeia de raciocínio lógico (Chain of Thought) em português sobre o risco da carteira.\n"
            f"   - 'brief_text': Resumo executivo matinal de 1 parágrafo em português focado e direto para exibição.\n"
        )
        
        payload = {
            "model": MODEL_NAME,
            "prompt": prompt,
            "format": "json",
            "stream": False,
            "keep_alive": 0
        }
        
        # Consulta o Ollama local com timeout de 180 segundos
        response = requests.post(OLLAMA_URL, json=payload, timeout=180)
        
        if response.status_code == 200:
            res_data = response.json()
            response_text = res_data.get("response", "").strip()
            
            try:
                parsed = json.loads(response_text)
                brief_data = {
                    "status": "Sucesso",
                    "selic_rate": f"{selic * 100:.2f}%",
                    "dolar_rate": f"R$ {dolar_rate:.2f}",
                    "rationale": parsed.get("rationale", ""),
                    "brief_text": parsed.get("brief_text", "Morning Brief indisponível.")
                }
                
                # Atualiza cache
                _BRIEF_CACHE["data"] = brief_data
                _BRIEF_CACHE["last_updated"] = now
                return jsonify(brief_data)
            except Exception as parse_err:
                logging.warning(f"⚠️ [IA] Falha ao parsear JSON do Morning Brief: {parse_err}")
                return jsonify({
                    "status": "Aviso",
                    "brief_text": response_text
                })
        else:
            return jsonify({
                "status": "Erro",
                "brief_text": "Ollama inativo ou respondendo com falha. Verifique o status da IA no diagnóstico de saúde."
            }), 500
            
    except requests.exceptions.Timeout:
        return jsonify({
            "status": "Aviso",
            "brief_text": "O Ollama demorou muito para responder (timeout de 15s). A IA pode estar sobrecarregada ou fria."
        })
    except Exception as e:
        logging.error(f"❌ [BRIEF] Falha geral no Morning Brief: {e}", exc_info=True)
        return jsonify({"status": "Erro", "msg": str(e)}), 500
    finally:
        Session.remove()
