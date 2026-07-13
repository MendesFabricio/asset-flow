import logging
import requests
import json
from flask import Blueprint, request, Response, stream_with_context, jsonify, g
from database.models import Session, Asset, Position, LoanInstallment
from infrastructure.ollama_service import OLLAMA_CHAT_URL, MODEL_NAME, get_ollama_tools
from domain.quant.risk import calculate_risk_metrics
from infrastructure.price_cache import fetch_price_history as _fetch_price_history_fn

ai_bp = Blueprint('ai', __name__)

SYSTEM_PROMPT = (
    "Você é o Jarvis, o assistente virtual inteligente quantitativo e analista de investimentos pessoal do AssetFlow.\n"
    "Seu papel é ajudar o usuário com dúvidas sobre sua carteira de investimentos, recebíveis e análise de ativos de forma técnica, objetiva e transparente.\n\n"
    "REGRAS CRÍTICAS DE COMPORTAMENTO:\n"
    "1. Você é TERMINANTEMENTE PROIBIDO de calcular porcentagens de alocação, somar valores consolidados ou realizar cálculos complexos de risco por conta própria. "
    "Modelos de linguagem são ruins em matemática e propensos a alucinações matemáticas. Se o usuário perguntar qualquer coisa sobre o saldo, alocação, "
    "ativos em carteira, recebíveis ou métricas quantitativas de risco (Sharpe, Beta, VaR, Max Drawdown, etc.), você DEVE acionar a ferramenta `query_portfolio_metrics`.\n"
    "2. Se o usuário solicitar uma análise fundamentalista, valuation ou múltiplos financeiros de uma empresa (como margens, ROE, dívida, etc.), "
    "você não deve tentar inventar ou assumir nenhum dado. Você DEVE obrigatoriamente chamar a ferramenta `get_asset_fundamental_data` passando o ticker correto.\n"
    "3. Use sempre as informações exatas retornadas pelas ferramentas para responder de forma precisa. Se as ferramentas retornarem dados, cite-os de forma literal.\n"
    "4. Responda sempre em português, com formatação Markdown profissional, utilizando listas e tabelas para organizar dados numéricos."
)

def execute_query_portfolio_metrics(session):
    positions = session.query(Position).filter_by(user_id=g.user_id).options(joinedload(Position.asset)).all()
    portfolio_summary = []
    dolar_rate = 5.80
    try:
        from services import PortfolioService
        dolar_rate = PortfolioService().get_usd_rate()
    except Exception:
        pass
        
    for pos in positions:
        asset = pos.asset
        if asset and pos.quantity > 0:
            mdata = asset.market_data[0] if asset.market_data else None
            price = float(mdata.price or pos.average_price or 0) if mdata else float(pos.average_price or 0)
            fator = float(dolar_rate) if asset.currency == 'USD' else 1.0
            val = float(pos.quantity) * price * fator
            portfolio_summary.append(
                f"- {asset.ticker}: Categoria={asset.category.name if asset.category else 'Outros'}, Moeda={asset.currency}, Qtd={pos.quantity:.2f}, PM=R${pos.average_price:.2f}, Preço Atual=R${price:.2f}, Valor Total=R${val:.2f}, Meta={pos.target_percent:.1f}%"
            )
            
    # Recebíveis
    installments = (
        session.query(LoanInstallment)
        .filter(LoanInstallment.status.in_(['ABERTA', 'ATRASADA']), LoanInstallment.is_deleted == False, LoanInstallment.user_id == g.user_id)
        .all()
    )
    rec_summary = []
    for inst in installments:
        rec_summary.append(
            f"- Recebível: {inst.loan.descricao}, Devedor={inst.loan.debtor.nome if inst.loan.debtor else 'Desconhecido'}, Parcela=R${inst.valor_parcela:.2f}, Parcela Atual={inst.numero_parcela}/{inst.loan.total_parcelas}, Vencimento={inst.data_vencimento.strftime('%Y-%m-%d')}"
        )
        
    # Métricas de risco
    risk_summary = ""
    try:
        risk_metrics = calculate_risk_metrics(session, _fetch_price_history_fn)
        if risk_metrics.get("status") == "Sucesso":
            risk_summary = (
                f"- Beta da Carteira: {risk_metrics.get('beta')}\n"
                f"- Alpha Anual (Jensen): {risk_metrics.get('alpha_anual_pct')}%\n"
                f"- Sharpe Ratio (12m): {risk_metrics.get('sharpe_12m')}\n"
                f"- Sortino Ratio (12m): {risk_metrics.get('sortino_12m')}\n"
                f"- Volatilidade Anual: {risk_metrics.get('volatilidade_anual_pct')}%\n"
                f"- Max Drawdown (Histórico): {risk_metrics.get('max_drawdown_pct')}%\n"
                f"- Value at Risk (VaR 95% Mensal de Cornish-Fisher): {risk_metrics.get('var_95_monthly_pct')}%\n"
                f"- Conditional VaR (CVaR 95% Mensal): {risk_metrics.get('cvar_95_monthly_pct')}%\n"
                f"- Tracking Error vs IBOV: {risk_metrics.get('tracking_error_pct')}%"
            )
    except Exception as e:
        risk_summary = f"Erro ao calcular métricas: {str(e)}"
        
    return {
        "status": "Sucesso",
        "portfolio_summary": portfolio_summary if portfolio_summary else "Nenhum ativo com posição ativa no momento.",
        "receivables_summary": rec_summary if rec_summary else "Nenhum recebível ativo no momento.",
        "risk_metrics_summary": risk_summary
    }

def execute_get_asset_fundamental_data(session, ticker: str):
    ticker = ticker.strip().upper()
    asset = session.query(Asset).filter_by(ticker=ticker).first()
    if not asset:
        return {"status": "Erro", "error": f"Ativo com ticker '{ticker}' não foi encontrado no banco de dados."}
        
    cvm_context = "Nenhum demonstrativo fundamentalista disponível."
    if asset.cvm_code:
        try:
            from utils.cvm_processor import CVMProcessor
            cvm_data = CVMProcessor.get_dashboard_data(asset.cvm_code)
            if cvm_data:
                info = cvm_data.get("ticker_info", {})
                cards = cvm_data.get("cards_indicadores", [])
                metrics_str = ", ".join([f"{c['titulo']}: {c.get('valor_formatado') or c.get('valor')}" for c in cards])
                cvm_context = (
                    f"Demonstrativos CVM Ação (Data-base: {info.get('data_base')}, Período: {info.get('ultimo_periodo')}):\n"
                    f"{metrics_str}"
                )
        except Exception as e:
            cvm_context = f"Erro ao buscar demonstrativos CVM: {str(e)}"
    elif asset.category and asset.category.name == "FII":
        try:
            pos = asset.position
            if pos and pos.last_report_type:
                data = json.loads(pos.last_report_type)
                fundamentalist = data.get("fundamentalist")
                if fundamentalist:
                    info = fundamentalist.get("ticker_info", {})
                    cards = fundamentalist.get("cards_indicadores", [])
                    metrics_str = ", ".join([f"{c['titulo']}: {c.get('valor_formatado') or c.get('valor')}" for c in cards])
                    cvm_context = (
                        f"Demonstrativos FII (Data-base: {info.get('data_base')}, Período: {info.get('ultimo_periodo')}):\n"
                        f"{metrics_str}"
                    )
        except Exception as e:
            cvm_context = f"Erro ao extrair demonstrativos FII: {str(e)}"
            
    # Obter dados de múltiplos se houver
    mdata_summary = "Dados de mercado indisponíveis."
    if asset.market_data:
        mdata = asset.market_data[0]
        mdata_summary = f"Preço Atual: R$ {mdata.price or 0:.2f}, Mín 6m: R$ {mdata.min_6m or 0:.2f}, Variação: {mdata.change_percent or 0:.2f}%, RSI(14): {mdata.rsi_14 or 'N/A'}, SMA(20): R$ {mdata.sma_20 or 'N/A'}"
        
    return {
        "status": "Sucesso",
        "ticker": ticker,
        "name": asset.name,
        "cnpj": asset.cnpj,
        "cvm_code": asset.cvm_code,
        "category": asset.category.name if asset.category else "Outros",
        "market_data": mdata_summary,
        "cvm_financials": cvm_context
    }

@ai_bp.route('/api/ai/chat', methods=['POST'])
def chat():
    body = request.get_json(silent=True) or {}
    message = body.get("message", "").strip()
    session_id = body.get("session_id", "default_session").strip()
    
    if not message:
        return Response("Por favor, envie uma mensagem válida.", mimetype='text/plain', status=400)
        
    try:
        from database.models import AIChatHistory
        session = Session()
        
        # 1. Salva a pergunta do usuário no banco
        user_msg_db = AIChatHistory(session_id=session_id, role="user", content=message, user_id=g.user_id)
        session.add(user_msg_db)
        session.commit()
        
        # 2. Resgata histórico persistido desta sessão no SQLite
        db_history = session.query(AIChatHistory).filter_by(session_id=session_id, user_id=g.user_id).order_by(AIChatHistory.created_at.asc()).all()
        
        Session.remove()  # Libera para a thread de streaming
        
        tools = get_ollama_tools()
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT}
        ]
        
        # Injeta o histórico persistido (excluindo a última mensagem do usuário que adicionaremos depois)
        for msg in db_history[:-1]:
            messages.append({"role": msg.role, "content": msg.content})
            
        # Adiciona a mensagem atual do usuário
        messages.append({"role": "user", "content": message})
        
        def generate_stream():
            yield "💡 *Jarvis: Analisando sua pergunta...*\n\n"
            stream_session = Session()
            try:
                # Loop de execução do agente (máximo 5 iterações para evitar loops infinitos)
                for i in range(5):
                    payload = {
                        "model": MODEL_NAME,
                        "messages": messages,
                        "tools": tools,
                        "stream": False,
                        "keep_alive": "5m"
                    }
                    
                    logging.info(f"🤖 [Jarvis Agent] Enviando requisição para o Ollama (Iteração {i+1})...")
                    response = requests.post(OLLAMA_CHAT_URL, json=payload, timeout=240)
                    if response.status_code != 200:
                        raise Exception(f"Ollama respondeu com status {response.status_code}")
                        
                    res_data = response.json()
                    assistant_message = res_data.get("message", {})
                    tool_calls = assistant_message.get("tool_calls", [])
                    
                    if not tool_calls:
                        break
                        
                    messages.append(assistant_message)
                    
                    for tool_call in tool_calls:
                        func_name = tool_call.get("function", {}).get("name")
                        args = tool_call.get("function", {}).get("arguments", {})
                        
                        logging.info(f"🔧 [Jarvis Agent] Executando ferramenta local: '{func_name}' com args: {args}")
                        
                        if func_name == "query_portfolio_metrics":
                            yield "💡 *Ação: Consultando ativos da carteira e recalculando indicadores de risco...*\n\n"
                            result = execute_query_portfolio_metrics(stream_session)
                        elif func_name == "get_asset_fundamental_data":
                            ticker = args.get("ticker", "")
                            yield f"💡 *Ação: Buscando e analisando demonstrativos financeiros da CVM para {ticker}...*\n\n"
                            result = execute_get_asset_fundamental_data(stream_session, ticker)
                        else:
                            result = {"status": "Erro", "error": f"Ferramenta '{func_name}' não suportada."}
                            
                        messages.append({
                            "role": "tool",
                            "name": func_name,
                            "content": json.dumps(result)
                         })
                
                # Resposta final por streaming
                final_payload = {
                    "model": MODEL_NAME,
                    "messages": messages,
                    "stream": True,
                    "keep_alive": "5m"
                }
                
                response = requests.post(OLLAMA_CHAT_URL, json=final_payload, stream=True, timeout=240)
                if response.status_code != 200:
                    yield "Erro na geração final por streaming."
                    return
                    
                full_response = ""
                for line in response.iter_lines():
                    if line:
                        chunk = json.loads(line.decode('utf-8'))
                        content = chunk.get("message", {}).get("content", "")
                        if content:
                            full_response += content
                            yield content
                            
                # 3. Salva a resposta do assistente no banco
                if full_response.strip():
                    from database.models import AIChatHistory
                    assistant_msg_db = AIChatHistory(session_id=session_id, role="assistant", content=full_response, user_id=g.user_id)
                    stream_session.add(assistant_msg_db)
                    stream_session.commit()
                    
            except Exception as stream_err:
                logging.error(f"Erro no stream do agente: {stream_err}")
                yield f"\n[Erro de conexão com o Ollama: {stream_err}]"
            finally:
                Session.remove()

        return Response(stream_with_context(generate_stream()), mimetype='text/plain')
        
    except Exception as e:
        logging.error(f"❌ Falha crítica no Agente Jarvis: {e}", exc_info=True)
        return Response(f"Erro interno no Jarvis: {str(e)}", mimetype='text/plain', status=500)


@ai_bp.route('/api/ai/history', methods=['GET'])
def get_ai_history():
    session_id = request.args.get('session_id', 'default_session').strip()
    session = Session()
    try:
        from database.models import AIChatHistory
        history_records = session.query(AIChatHistory).filter_by(session_id=session_id, user_id=g.user_id).order_by(AIChatHistory.created_at.asc()).all()
        data = [{"role": msg.role, "content": msg.content, "created_at": msg.created_at.isoformat()} for msg in history_records]
        return jsonify({"status": "Sucesso", "data": data})
    except Exception as e:
        return jsonify({"status": "Erro", "msg": str(e)}), 500
    finally:
        Session.remove()


@ai_bp.route('/api/ai/history/clear', methods=['POST'])
def clear_ai_history():
    body = request.get_json(silent=True) or {}
    session_id = body.get('session_id', 'default_session').strip()
    session = Session()
    try:
        from database.models import AIChatHistory, safe_commit
        session.query(AIChatHistory).filter_by(session_id=session_id, user_id=g.user_id).delete()
        safe_commit(session)
        return jsonify({"status": "Sucesso", "msg": f"Histórico da sessão '{session_id}' limpo."})
    except Exception as e:
        session.rollback()
        return jsonify({"status": "Erro", "msg": str(e)}), 500
    finally:
        Session.remove()


@ai_bp.route('/api/ai/explain-score/<ticker>', methods=['GET'])
def explain_score(ticker):
    ticker = ticker.strip().upper()
    session = Session()
    try:
        asset = session.query(Asset).filter_by(ticker=ticker).first()
        if not asset:
            return jsonify({"status": "Erro", "msg": f"Ativo '{ticker}' não encontrado."}), 404
        
        from services import PortfolioService
        service = PortfolioService()
        
        asset_data = service.get_single_asset_score_data(ticker)
        if not asset_data:
            return jsonify({"status": "Erro", "msg": "Ativo sem posição ou métricas ativas."}), 400
            
        score = asset_data.get("score", 50)
        recomendacao = asset_data.get("recomendacao", "MANTER")
        motivo = asset_data.get("motivo", "")
        price = asset_data.get("preco_atual", 0.0)
        
        prompt = (
            f"Você é o Jarvis. Explique de forma muito concisa, amigável e direta "
            f"(em no máximo 2 parágrafos curtos) o racional por trás do score de recomendação do ativo {ticker}.\n\n"
            f"DADOS DO ATIVO:\n"
            f"- Nome: {asset.name}\n"
            f"- Categoria: {asset.category.name if asset.category else 'Outros'}\n"
            f"- Score: {score}/100\n"
            f"- Recomendação: {recomendacao}\n"
            f"- Fatores analisados: {motivo}\n"
            f"- Preço Atual: R$ {price:.2f}\n"
        )
        
        payload = {
            "model": MODEL_NAME,
            "messages": [
                {"role": "system", "content": "Você é o assistente virtual Jarvis do AssetFlow. Diga apenas a explicação em português."},
                {"role": "user", "content": prompt}
            ],
            "stream": False,
            "keep_alive": "5m"
        }
        
        response = requests.post(OLLAMA_CHAT_URL, json=payload, timeout=120)
        if response.status_code == 200:
            explanation = response.json().get("message", {}).get("content", "").strip()
        else:
            explanation = f"O score do ativo {ticker} é {score} ({recomendacao}) devido aos seguintes fatores: {motivo}."
            
        return jsonify({
            "status": "Sucesso",
            "ticker": ticker,
            "score": score,
            "recomendacao": recomendacao,
            "explanation": explanation
        })
    except Exception as e:
        logging.error(f"Erro ao explicar score de {ticker}: {e}", exc_info=True)
        return jsonify({"status": "Erro", "msg": str(e)}), 500
    finally:
        Session.remove()
