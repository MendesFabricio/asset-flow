import logging
import requests
import json
from flask import Blueprint, request, Response, stream_with_context
from database.models import Session, Asset, Position, Receivable
from infrastructure.ollama_service import OLLAMA_CHAT_URL, MODEL_NAME, get_ollama_tools
from domain.quant_engine import calculate_risk_metrics
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
    assets = session.query(Asset).outerjoin(Position).all()
    portfolio_summary = []
    dolar_rate = 5.80
    try:
        from services import PortfolioService
        dolar_rate = PortfolioService().get_usd_rate()
    except Exception:
        pass
        
    for asset in assets:
        pos = asset.position
        if pos and pos.quantity > 0:
            mdata = asset.market_data[0] if asset.market_data else None
            price = float(mdata.price or pos.average_price or 0) if mdata else float(pos.average_price or 0)
            fator = dolar_rate if asset.currency == 'USD' else 1.0
            val = float(pos.quantity) * price * fator
            portfolio_summary.append(
                f"- {asset.ticker}: Categoria={asset.category.name if asset.category else 'Outros'}, Moeda={asset.currency}, Qtd={pos.quantity:.2f}, PM=R${pos.average_price:.2f}, Preço Atual=R${price:.2f}, Valor Total=R${val:.2f}, Meta={pos.target_percent:.1f}%"
            )
            
    # Recebíveis
    receivables = session.query(Receivable).filter(Receivable.status != 'Concluido').all()
    rec_summary = []
    for r in receivables:
        rec_summary.append(
            f"- Recebível: {r.descricao}, Devedor={r.devedor}, Parcela=R${r.valor_parcela:.2f}, Parcela Atual={r.parcela_atual}/{r.total_parcelas}, Dia Vencimento={r.vencimento_dia}"
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
        
    cvm_context = "Nenhum demonstrativo CVM disponível."
    if asset.cvm_code:
        try:
            from utils.cvm_processor import CVMProcessor
            cvm_data = CVMProcessor.get_dashboard_data(asset.cvm_code)
            if cvm_data:
                info = cvm_data.get("ticker_info", {})
                cards = cvm_data.get("cards_indicadores", [])
                metrics_str = ", ".join([f"{c['titulo']}: {c.get('valor_formatado') or c.get('valor')}" for c in cards])
                cvm_context = (
                    f"Demonstrativos CVM (Data-base: {info.get('data_base')}, Período: {info.get('ultimo_periodo')}):\n"
                    f"{metrics_str}"
                )
        except Exception as e:
            cvm_context = f"Erro ao buscar demonstrativos CVM: {str(e)}"
            
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
    
    if not message:
        return Response("Por favor, envie uma mensagem válida.", mimetype='text/plain', status=400)
        
    session = Session()
    try:
        tools = get_ollama_tools()
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": message}
        ]
        
        # Loop de execução do agente (máximo 5 iterações para evitar loops infinitos)
        for i in range(5):
            payload = {
                "model": MODEL_NAME,
                "messages": messages,
                "tools": tools,
                "stream": False,
                "keep_alive": 0
            }
            
            logging.info(f"🤖 [Jarvis Agent] Enviando requisição para o Ollama (Iteração {i+1})...")
            response = requests.post(OLLAMA_CHAT_URL, json=payload, timeout=120)
            if response.status_code != 200:
                raise Exception(f"Ollama respondeu com status {response.status_code}")
                
            res_data = response.json()
            assistant_message = res_data.get("message", {})
            tool_calls = assistant_message.get("tool_calls", [])
            
            if not tool_calls:
                break
                
            # Adiciona a mensagem do assistente contendo as chamadas de ferramentas planejadas
            messages.append(assistant_message)
            
            # Resolve cada chamada de ferramenta
            for tool_call in tool_calls:
                func_name = tool_call.get("function", {}).get("name")
                args = tool_call.get("function", {}).get("arguments", {})
                
                logging.info(f"🔧 [Jarvis Agent] Executando ferramenta local: '{func_name}' com args: {args}")
                
                if func_name == "query_portfolio_metrics":
                    result = execute_query_portfolio_metrics(session)
                elif func_name == "get_asset_fundamental_data":
                    ticker = args.get("ticker", "")
                    result = execute_get_asset_fundamental_data(session, ticker)
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
            "keep_alive": 0
        }
        
        def generate_stream():
            try:
                response = requests.post(OLLAMA_CHAT_URL, json=final_payload, stream=True, timeout=240)
                if response.status_code != 200:
                    yield "Erro na geração final por streaming."
                    return
                for line in response.iter_lines():
                    if line:
                        chunk = json.loads(line.decode('utf-8'))
                        content = chunk.get("message", {}).get("content", "")
                        if content:
                            yield content
            except Exception as stream_err:
                logging.error(f"Erro no stream do agente: {stream_err}")
                yield f"\n[Erro de conexão com o Ollama: {stream_err}]"

        return Response(stream_with_context(generate_stream()), mimetype='text/plain')
        
    except Exception as e:
        logging.error(f"❌ Falha crítica no Agente Jarvis: {e}", exc_info=True)
        return Response(f"Erro interno no Jarvis: {str(e)}", mimetype='text/plain', status=500)
    finally:
        session.close()
