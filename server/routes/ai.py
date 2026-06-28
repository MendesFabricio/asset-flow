import logging
import requests
from flask import Blueprint, request, jsonify
from database.models import Session, Asset, Position, Receivable
from infrastructure.ollama_service import OLLAMA_URL, MODEL_NAME
from domain.quant_engine import calculate_risk_metrics
from infrastructure.price_cache import fetch_price_history as _fetch_price_history_fn

ai_bp = Blueprint('ai', __name__)

@ai_bp.route('/api/ai/chat', methods=['POST'])
def chat():
    body = request.get_json(silent=True) or {}
    message = body.get("message", "").strip()
    
    if not message:
        return jsonify({"response": "Por favor, digite uma mensagem válida."})
        
    session = Session()
    try:
        # 1. Coleta dados da Carteira em tempo real
        assets = (
            session.query(Asset)
            .outerjoin(Position)
            .all()
        )
        
        portfolio_summary = []
        dolar_rate = 5.80 # fallback
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
                
        # 2. Coleta dados de recebíveis pendentes
        receivables = session.query(Receivable).filter(Receivable.status != 'Concluido').all()
        rec_summary = []
        for r in receivables:
            rec_summary.append(
                f"- Recebível: {r.descricao}, Devedor={r.devedor}, Parcela=R${r.valor_parcela:.2f}, Parcela Atual={r.parcela_atual}/{r.total_parcelas}, Dia Vencimento={r.vencimento_dia}"
            )
            
        # 3. Coleta dados de métricas quantitativas e cauda
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
                    f"- Value at Risk (VaR 95% Mensal): {risk_metrics.get('var_95_monthly_pct')}%\n"
                    f"- Conditional VaR (CVaR 95% Mensal): {risk_metrics.get('cvar_95_monthly_pct')}%\n"
                    f"- Tracking Error vs IBOV: {risk_metrics.get('tracking_error_pct')}%"
                )
        except Exception as e:
            logging.warning(f"⚠️ Não foi possível calcular métricas de risco para o chat: {e}")
            
        # 4. Constrói o prompt com contexto consciente da carteira
        prompt = (
            f"Você é o Jarvis do AssetFlow, um analista financeiro quantitativo e consultor pessoal de investimentos.\n"
            f"Sua missão é responder à dúvida do usuário com base nos dados reais do portfólio dele.\n\n"
            f"=== CONTEXTO DA CARTEIRA DO USUÁRIO ===\n"
            + ("\n".join(portfolio_summary) if portfolio_summary else "Nenhum ativo na carteira atualmente.") + "\n\n"
            f"=== RECEBÍVEIS ATIVOS (FLUXO DE CAIXA) ===\n"
            + ("\n".join(rec_summary) if rec_summary else "Nenhum fluxo de recebível pendente.") + "\n\n"
            f"=== MÉTRICAS QUANTITATIVAS DA CARTEIRA ===\n"
            f"{risk_summary or 'Métricas de risco indisponíveis no momento.'}\n\n"
            f"=== INSTRUÇÕES ===\n"
            f"1. Responda diretamente e em português de forma técnica, objetiva e analítica.\n"
            f"2. Use formatação Markdown (negrito, listas, tabelas) para organizar dados.\n"
            f"3. Destaque riscos de concentração ou volatilidade alta se o usuário perguntar sobre a carteira.\n"
            f"4. Dúvida do usuário: '{message}'\n\n"
            f"Resposta:"
        )
        
        payload = {
            "model": MODEL_NAME,
            "prompt": prompt,
            "stream": False,
            "keep_alive": 0
        }
        
        # 5. Consulta o Ollama
        response = requests.post(OLLAMA_URL, json=payload, timeout=240)
        
        if response.status_code == 200:
            res_data = response.json()
            reply = res_data.get("response", "").strip()
            return jsonify({"status": "Sucesso", "response": reply})
        else:
            return jsonify({"status": "Erro", "response": "Erro na comunicação com a inteligência artificial local."}), 502
            
    except Exception as e:
        logging.error(f"❌ Falha no chat de IA: {e}", exc_info=True)
        return jsonify({"status": "Erro", "response": f"Erro interno ao processar dados da carteira: {str(e)}"}), 500
    finally:
        session.close()
