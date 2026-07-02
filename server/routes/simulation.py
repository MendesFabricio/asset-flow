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
from database.models import Session, Asset, Position, MarketData, SystemCache, safe_commit
from domain.quant_engine import get_risk_free_rate, _to_yf_ticker
from infrastructure.ollama_service import OLLAMA_URL, MODEL_NAME
from sqlalchemy.orm import joinedload, selectinload

simulation_bp = Blueprint('simulation', __name__)
service = PortfolioService()

@simulation_bp.route('/api/simulation/optimize', methods=['GET'])
def optimize_portfolio():
    """📈 Rota de Fronteira Eficiente: Retorna alocação de Sharpe Máximo (Markowitz)"""
    session = Session()
    try:
        from datetime import datetime, timedelta
        # 1. Tenta recuperar do cache persistido
        cache_record = session.query(SystemCache).filter_by(key="optimize_portfolio").first()
        if cache_record:
            age = datetime.now() - cache_record.updated_at
            if age < timedelta(hours=1):
                logging.info("📈 Retornando simulação de Markowitz do Cache...")
                return jsonify(json.loads(cache_record.value))

        # 2. Se não estiver em cache, calcula
        res = service.calculate_markowitz_optimization()
        if res.get("status") == "Sucesso" or "status" not in res:
            if not cache_record:
                cache_record = SystemCache(key="optimize_portfolio")
                session.add(cache_record)
            cache_record.value = json.dumps(res)
            cache_record.updated_at = datetime.now()
            safe_commit(session)
            
        return jsonify(res)
    except Exception as e:
        logging.error(f"❌ Erro na simulação de Markowitz: {e}", exc_info=True)
        return jsonify({"status": "Erro", "msg": str(e)}), 500
    finally:
        Session.remove()

@simulation_bp.route('/api/simulation/risk-parity', methods=['GET'])
def risk_parity_portfolio():
    """⚖️ Rota de Paridade de Risco: Sugere pesos baseados em volatilidade individual e covariância"""
    session = Session()
    try:
        from datetime import datetime, timedelta
        # 1. Tenta recuperar do cache persistido
        cache_record = session.query(SystemCache).filter_by(key="risk_parity").first()
        if cache_record:
            age = datetime.now() - cache_record.updated_at
            if age < timedelta(hours=1):
                logging.info("⚖️ Retornando Paridade de Risco do Cache...")
                return jsonify(json.loads(cache_record.value))

        # 2. Se não estiver em cache, calcula
        res = service.calculate_risk_parity()
        if res.get("status") == "Sucesso" or "status" not in res:
            if not cache_record:
                cache_record = SystemCache(key="risk_parity")
                session.add(cache_record)
            cache_record.value = json.dumps(res)
            cache_record.updated_at = datetime.now()
            safe_commit(session)
            
        return jsonify(res)
    except Exception as e:
        logging.error(f"❌ Erro na simulação de Paridade de Risco: {e}", exc_info=True)
        return jsonify({"status": "Erro", "msg": str(e)}), 500
    finally:
        Session.remove()

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
    session = Session()
    try:
        # 1. Retorna do cache se estiver válido (expiração de 4 horas)
        from flask import request
        force_reanalyze = request.args.get("force", "false").lower() == "true"
        
        from datetime import datetime, timedelta
        cache_record = session.query(SystemCache).filter_by(key="morning_brief").first()
        if cache_record and not force_reanalyze:
            age = datetime.now() - cache_record.updated_at
            if age < timedelta(hours=4):
                return jsonify(json.loads(cache_record.value))

        selic = get_risk_free_rate()
        dolar_rate = service.get_usd_rate()
        
        # Coleta todas as posições ativas da carteira
        positions = (
            session.query(Position)
            .options(
                joinedload(Position.asset).joinedload(Asset.category),
                joinedload(Position.asset).selectinload(Asset.market_data)
            )
            .filter(Position.quantity > 0)
            .all()
        )
        
        total_portfolio_val = 0.0
        holdings_details = []
        
        for pos in positions:
            if not pos.asset:
                continue
            mdata = pos.asset.market_data[0] if pos.asset.market_data else None
            price = float(mdata.price or pos.average_price or 0.0) if mdata else float(pos.average_price or 0.0)
            fator = float(dolar_rate or 1.0) if pos.asset.currency == 'USD' else 1.0
            qty = float(pos.quantity or 0.0)
            val = qty * price * fator
            
            if val > 0:
                total_portfolio_val += val
                
                # Cálculo de Lucro/Prejuízo frente ao Preço Médio
                avg_price = float(pos.average_price or 0.0)
                profit_loss_pct = 0.0
                if avg_price > 0:
                    profit_loss_pct = ((price - avg_price) / avg_price) * 100
                
                status_text = ""
                if profit_loss_pct > 0.01:
                    status_text = f"{profit_loss_pct:.1f}% de LUCRO"
                elif profit_loss_pct < -0.01:
                    status_text = f"{abs(profit_loss_pct):.1f}% de PREJUÍZO"
                else:
                    status_text = "0.0% de variação (no ponto de equilíbrio)"
                
                holdings_details.append({
                    "ticker": pos.asset.ticker.upper(),
                    "category": pos.asset.category.name if pos.asset.category else "Outros",
                    "value": val,
                    "target_pct": float(pos.target_percent or 0.0),
                    "status_text": status_text
                })
                
        # Ordena as posições do portfólio pelo valor total em ordem decrescente
        holdings_details.sort(key=lambda x: x["value"], reverse=True)
        top_holdings = holdings_details[:3]
        
        holdings_text_lines = []
        for h in top_holdings:
            weight_pct = 0.0
            if total_portfolio_val > 0:
                weight_pct = (h["value"] / total_portfolio_val) * 100
                
            holdings_text_lines.append(
                f"- {h['ticker']} (Categoria: {h['category']}, Peso Atual: {weight_pct:.1f}% da carteira, "
                f"Meta: {h['target_pct']:.1f}%, Status: Posição atual com {h['status_text']} frente ao preço médio de aquisição)."
            )
            
        holdings_text = "\n".join(holdings_text_lines)
        
        # Constrói o Prompt econômico contextualizado com Engenharia Financeira robusta
        prompt = (
            f"Você é um economista-chefe e gestor de portfólio senior.\n"
            f"Elabore um briefing de mercado matinal de 1 parágrafo em português focado no risco destas 3 maiores posições da carteira do investidor:\n"
            f"{holdings_text or 'Nenhuma posição ativa no momento.'}\n\n"
            f"Cenário macroeconômico atual:\n"
            f"- Taxa Básica de Juros (Selic): {selic * 100:.2f}%\n"
            f"- Cotação do Dólar (USD/BRL): R$ {dolar_rate:.2f}\n\n"
            f"Instruções estritas de comportamento de Engenharia Financeira:\n"
            f"1. Você receberá o Ticker, a Categoria exata e a saúde financeira de cada ativo. Baseie-se estritamente nestes metadados estruturados. Nunca invente o perfil ou o setor de atuação de um ticker se ele contradisser a categoria informada.\n"
            f"2. Pondere o impacto direto da taxa Selic atual de {selic * 100:.2f}% nas classes informadas (ex: Selic elevada beneficia posições de crédito privado e FIIs de recebíveis indexados ao CDI, mas gera vento contra em valuations de ações de crescimento e FIIs de tijolo).\n"
            f"3. Foque a análise de alocação de risco exclusivamente no contexto destas posições.\n"
            f"4. NUNCA mencione conselhos macro generalistas.\n"
            f"5. Responda estritamente em formato JSON contendo as chaves exatas:\n"
            f"   - 'rationale': Cadeia de raciocínio lógico (Chain of Thought) em português sobre o risco da carteira.\n"
            f"   - 'brief_text': Resumo executivo matinal de 1 parágrafo em português focado e direto para exibição.\n"
        )
        
        payload = {
            "model": MODEL_NAME,
            "prompt": prompt,
            "format": "json",
            "stream": False,
            "keep_alive": "5m"
        }
        
        # Consulta o Ollama local com timeout de 180 segundos para suportar processamento em CPU
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
                cache_record = session.query(SystemCache).filter_by(key="morning_brief").first()
                if not cache_record:
                    cache_record = SystemCache(key="morning_brief")
                    session.add(cache_record)
                cache_record.value = json.dumps(brief_data)
                cache_record.updated_at = datetime.now()
                safe_commit(session)
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
            "brief_text": "O Ollama demorou muito para responder (timeout de 60s). A IA pode estar sobrecarregada ou fria."
        })
    except Exception as e:
        logging.error(f"❌ [BRIEF] Falha geral no Morning Brief: {e}", exc_info=True)
        return jsonify({"status": "Erro", "msg": str(e)}), 500
    finally:
        Session.remove()

@simulation_bp.route('/api/simulation/correlation', methods=['GET'])
def sector_correlation():
    """🧮 Rota de Correlação: Retorna a matriz de correlação de Pearson entre ativos"""
    try:
        res = service.calculate_sector_correlation()
        return jsonify(res)
    except Exception as e:
        logging.error(f"❌ Erro ao computar matriz de correlação: {e}", exc_info=True)
        return jsonify({"status": "Erro", "msg": str(e)}), 500
