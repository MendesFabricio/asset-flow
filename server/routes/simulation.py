"""
routes/simulation.py
Endpoints para simulações financeiras institucionais, otimizações quantitativas
(Markowitz, Paridade de Risco), exposição setorial e relatórios analíticos de IA (Morning Brief).
"""
import logging
import requests
import json
import threading
import time
from datetime import datetime, timedelta
from flask import Blueprint, jsonify, g, request
from services import PortfolioService
from database.models import Session, Asset, Position, SystemCache, safe_commit
from domain.quant.helpers import get_risk_free_rate
from infrastructure.ollama_service import OLLAMA_URL, MODEL_NAME
from sqlalchemy.orm import joinedload
from routes.news import get_daily_sector_summary

simulation_bp = Blueprint('simulation', __name__)
service = PortfolioService()

# Constantes de timeout (reduzidas de 300s/240s/180s para valores seguros)
OLLAMA_TIMEOUT_BRIEF = 180
OLLAMA_TIMEOUT_DEFAULT = 60


def _build_morning_brief_context(user_id: int, dolar_rate: float, selic: float) -> dict:
    """Constrói contexto enriquecido para o Morning Brief (compartilhado entre rota e worker)."""
    from database.models import Session as DBSession
    from sqlalchemy.orm import joinedload, selectinload
    from domain.quant.helpers import get_risk_free_rate as _get_rf
    
    with DBSession() as session:
        positions = (
            session.query(Position)
            .options(
                joinedload(Position.asset).joinedload(Asset.category),
                joinedload(Position.asset).selectinload(Asset.market_data)
            )
            .filter(Position.user_id == user_id, Position.quantity > 0)
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
                avg_price = float(pos.average_price or 0.0)
                profit_loss_pct = ((price - avg_price) / avg_price * 100) if avg_price > 0 else 0.0
                holdings_details.append({
                    "ticker": pos.asset.ticker.upper(),
                    "category": pos.asset.category.name if pos.asset.category else "Outros",
                    "value": val,
                    "target_pct": float(pos.target_percent or 0.0),
                    "profit_loss_pct": profit_loss_pct,
                    "price": price,
                    "weight_pct": 0.0,
                    "beta": "N/A",
                    "var_95": "N/A"
                })

        holdings_details.sort(key=lambda x: x["value"], reverse=True)
        for h in holdings_details:
            h["weight_pct"] = (h["value"] / total_portfolio_val * 100) if total_portfolio_val > 0 else 0.0

        # Risk metrics computados UMA VEZ (não 5x)
        risk = None
        try:
            risk = service.calculate_risk_metrics(session=session)
        except Exception:
            pass

        enriched_holdings = []
        for h in holdings_details[:5]:
            enriched = dict(h)
            if risk and risk.get("status") == "Sucesso":
                metrics = risk.get("metrics", {})
                enriched["beta"] = f"{metrics.get('beta', 0):.2f}"
                enriched["var_95"] = f"{metrics.get('var_95', 0):.2f}%"
            enriched_holdings.append(enriched)

    context = {
        "selic": float(selic),
        "dolar_rate": round(float(dolar_rate), 2),
        "selic_rate": f"{selic * 100:.2f}%",
        "dolar_rate_str": f"R$ {float(dolar_rate):.2f}",
        "holdings": enriched_holdings
    }
    return context


@simulation_bp.route('/api/simulation/optimize', methods=['GET'])
def optimize_portfolio():
    """📈 Rota de Fronteira Eficiente: Retorna alocação de Sharpe Máximo (Markowitz)"""
    with Session() as session:
        try:
            from datetime import datetime, timedelta
            cache_key = f"optimize_portfolio_{g.user_id}"
            # 1. Tenta recuperar do cache persistido
            cache_record = session.query(SystemCache).filter_by(key=cache_key).first()
            if cache_record:
                age = datetime.now() - cache_record.updated_at
                if age < timedelta(hours=1):
                    logging.info("📈 Retornando simulação de Markowitz do Cache...")
                    return jsonify(json.loads(cache_record.value))

            # 2. Se não estiver em cache, calcula
            res = service.calculate_markowitz_optimization()
            if res.get("status") == "Sucesso" or "status" not in res:
                if not cache_record:
                    cache_record = SystemCache(key=cache_key)
                    session.add(cache_record)
                cache_record.value = json.dumps(res)
                cache_record.updated_at = datetime.now()
                safe_commit(session)
                
            return jsonify(res)
        except Exception as e:
            logging.error(f"❌ Erro na simulação de Markowitz: {e}", exc_info=True)
            return jsonify({"status": "Erro", "msg": str(e)}), 500

@simulation_bp.route('/api/simulation/risk-parity', methods=['GET'])
def risk_parity_portfolio():
    """⚖️ Rota de Paridade de Risco: Sugere pesos baseados em volatilidade individual e covariância"""
    with Session() as session:
        try:
            from datetime import datetime, timedelta
            cache_key = f"risk_parity_{g.user_id}"
            # 1. Tenta recuperar do cache persistido
            cache_record = session.query(SystemCache).filter_by(key=cache_key).first()
            if cache_record:
                age = datetime.now() - cache_record.updated_at
                if age < timedelta(hours=1):
                    logging.info("⚖️ Retornando Paridade de Risco do Cache...")
                    return jsonify(json.loads(cache_record.value))

            # 2. Se não estiver em cache, calcula
            res = service.calculate_risk_parity()
            if res.get("status") == "Sucesso" or "status" not in res:
                if not cache_record:
                    cache_record = SystemCache(key=cache_key)
                    session.add(cache_record)
                cache_record.value = json.dumps(res)
                cache_record.updated_at = datetime.now()
                safe_commit(session)
                
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

def _run_morning_brief_bg(user_id: int, context: dict, cache_key: str):
    """Executa a chamada ao Ollama em thread de background e salva o resultado no cache."""
    from database.models import Session as DBSession, SystemCache, safe_commit
    try:
        prompt = _build_enhanced_morning_brief_prompt(context)
        payload = {"model": MODEL_NAME, "prompt": prompt, "format": "json", "stream": False, "keep_alive": "1m"}
        
        response = None
        for attempt in range(2):
            try:
                response = requests.post(OLLAMA_URL, json=payload, timeout=OLLAMA_TIMEOUT_BRIEF)
                break
            except requests.exceptions.Timeout:
                if attempt == 0:
                    logging.warning(f"⚠️ [BRIEF] Timeout na tentativa 1/2 para usuário {user_id}. Retrying...")
                    time.sleep(2)
                else:
                    raise
        
        brief_data = {
            "status": "Erro",
            "selic_rate": context.get("selic_rate", ""),
            "dolar_rate": context.get("dolar_rate", ""),
            "rationale": "",
            "brief_text": "Ollama inativo ou respondendo com falha.",
            "action": "",
            "risk_metrics": {}
        }
        
        if response and response.status_code == 200:
            res_data = response.json()
            response_text = res_data.get("response", "").strip()
            try:
                parsed = json.loads(response_text)
                brief_data = {
                    "status": "Sucesso",
                    "selic_rate": context.get("selic_rate", ""),
                    "dolar_rate": context.get("dolar_rate", ""),
                    "rationale": parsed.get("rationale", "") or "",
                    "brief_text": parsed.get("brief_text", "") or "Morning Brief indisponível.",
                    "action": parsed.get("action", "") or "",
                    "risk_metrics": parsed.get("risk_metrics", {}) or {}
                }
                if not brief_data["brief_text"]:
                    brief_data["brief_text"] = "Morning Brief indisponível."
            except Exception:
                logging.warning(f"⚠️ [BRIEF] Falha ao parsear JSON estruturado do Ollama. Usando texto puro.")
                brief_data = {
                    "status": "Aviso",
                    "selic_rate": context.get("selic_rate", ""),
                    "dolar_rate": context.get("dolar_rate", ""),
                    "rationale": "",
                    "brief_text": response_text,
                    "action": "",
                    "risk_metrics": {}
                }

        with DBSession() as session:
            cache_record = session.query(SystemCache).filter_by(key=cache_key).first()
            if not cache_record:
                cache_record = SystemCache(key=cache_key)
                session.add(cache_record)
            cache_record.value = json.dumps(brief_data)
            cache_record.updated_at = datetime.now()
            safe_commit(session)
            logging.info(f"✅ [BRIEF] Morning Brief do usuário {user_id} atualizado com sucesso em background.")
    except Exception as e:
        logging.error(f"❌ [BRIEF] Falha no background thread do Morning Brief: {e}", exc_info=True)


def _build_enhanced_morning_brief_prompt(context: dict) -> str:
    """Constrói prompt enriquecido com CoT, risk metrics, notícias e sentimento."""
    selic_pct = context.get("selic", 0.0) * 100
    dolar = context.get("dolar_rate", 0.0)
    date_str = datetime.now().strftime("%d/%m/%Y")
    
    holdings_lines = []
    for h in context.get("holdings", []):
        holdings_lines.append(
            f"- {h['ticker']} ({h['category']}) | Peso: {h['weight_pct']:.1f}% | Meta: {h['target_pct']:.1f}% | "
            f"P/L: {h['profit_loss_pct']:+.1f}% | Preço: R$ {h['price']:.2f} | Valor: R$ {h['value']:,.2f} | "
            f"Beta: {h.get('beta', 'N/A')} | VaR 95%: {h.get('var_95', 'N/A')}"
        )
    holdings_text = "\n".join(holdings_lines) if holdings_lines else "Nenhuma posição ativa no momento."

    news_lines = []
    for n in context.get("news", []):
        news_lines.append(f"- [{n.get('source', 'News')}] {n['title']}")
    news_text = "\n".join(news_lines) if news_lines else "Sem notícias relevantes encontradas."

    sentiment_lines = []
    for s in context.get("sentiment", []):
        sentiment_lines.append(f"- {s['ticker']}: {s['sentiment']} (score: {s.get('score', 'N/A')})")
    sentiment_text = "\n".join(sentiment_lines) if sentiment_lines else "Sem análise de sentimento disponível."

    prompt = f"""Você é um economista-chefe sênior especializado em gestão de portfólio de varejo.
Elabore um briefing matinal de risco e alocação para o dia {date_str}.

[CONTEXTO MACROECONÔMICO]
- Taxa Básica de Juros (Selic): {selic_pct:.2f}%
- Cotação do Dólar (USD/BRL): R$ {dolar:.2f}

[CARTEIRA DO INVESTIDOR — Top posições por contribution to risk]
{holdings_text}

[NOTÍCIAS RECENTES (últimas 24h)]
{news_text}

[SENTIMENTO POR ATIVO (últimos 7d)]
{sentiment_text}

[CHAIN-OF-THOUGHT OBRIGATÓRIO — NÃO mostrar ao usuário final]
Antes de escrever o briefing, raciocine internamente:
Passo 1: Como a Selic atual impacta cada categoria presente na carteira (Renda Fixa, FIIs, Ações, Internacional)?
Passo 2: Qual posição concentra mais risco? Calcule contribution to risk = peso × volatilidade × beta. Ordene por risco, não por valor.
Passo 3: Identifique outliers: posições >20% acima da meta ou <50% abaixo da meta.
Passo 4: Com base nos dados acima, qual ajuste de alocação traria melhor relação risco/retorno hoje?

[TAREFA]
Elabore o briefing em 3 seções, máximo 150 palavras no total:

1. **Cenário** (1-2 frases): Como a Selic e o dólar afetam a carteira HOJE, citando números concretos.
2. **Riscos & Oportunidades** (bullet points): Para cada posição top-3, cite:
   - 1 dado quantitativo (peso, P/L, VaR, Beta)
   - 1 evento recente relevante (notícia ou sentimento)
   - 1 ação sugerida (ex: "Reduzir X% para alinhar com meta Y%")
3. **Ação Recomendada** (1 frase): Qual ajuste de alocação traria mais risco/retorno hoje.

[REGRAS ESTRITAS]
- NÃO generalize: cite números concretos da carteira.
- NÃO use tautologias ("aumenta o risco se o preço cair").
- NÃO mencione ativos fora da carteira.
- NÃO dê conselhos macro generalistas sem ligação com as posições.
- Responda estritamente em JSON contendo as chaves exatas:
  - 'brief_text': texto final formatado em Markdown simples
  - 'rationale': cadeia de raciocínio interno (CoT) em português
  - 'action': frase curta com a ação recomendada
  - 'risk_metrics': objeto com métricas de risco agregadas da carteira
"""
    return prompt


@simulation_bp.route('/api/ai/morning-brief', methods=['GET', 'POST'])
def morning_brief():
    """
    ☕ Rota de Briefing Matinal — Padrão Async Fire-and-Forget.
    Retorna imediatamente o cache existente (ou um estado pendente) e dispara
    a geração em background, eliminando timeouts do Gunicorn com o Ollama em CPU.
    """
    with Session() as session:
        try:
            from flask import request
            force_reanalyze = False
            if request.method == 'POST':
                req_data = request.get_json(silent=True) or {}
                force_reanalyze = req_data.get("force", False)
            else:
                force_reanalyze = request.args.get("force", "false").lower() == "true"

            from datetime import datetime, timedelta
            cache_key = f"morning_brief_{g.user_id}"
            cache_record = session.query(SystemCache).filter_by(key=cache_key).first()

            # Se há cache válido (< 12h) e não forçou, retorna imediatamente
            if cache_record and not force_reanalyze:
                age = datetime.now() - cache_record.updated_at
                if age < timedelta(hours=12):
                    return jsonify(json.loads(cache_record.value))

            # Coleta dados do portfólio (rápido, sem Ollama)
            selic = get_risk_free_rate()
            dolar_rate = service.get_usd_rate()
            context = _build_morning_brief_context(g.user_id, dolar_rate, selic)

            # Retorna o cache antigo enquanto processa
            pending_response = {
                "status": "Processando",
                "selic_rate": context["selic_rate"],
                "dolar_rate": context["dolar_rate_str"],
                "rationale": "",
                "brief_text": "Morning Brief sendo gerado pela IA... Aguarde alguns instantes e recarregue.",
                "action": "",
                "risk_metrics": {}
            }
            if cache_record:
                try:
                    pending_response = json.loads(cache_record.value)
                    pending_response["status"] = "Processando"
                    pending_response["brief_text"] = "Morning Brief sendo gerado pela IA... Aguarde alguns instantes e recarregue."
                except Exception:
                    pass

            # Dispara Ollama em thread de background — não bloqueia o worker do Gunicorn
            t = threading.Thread(
                target=_run_morning_brief_bg,
                args=(g.user_id, context, cache_key),
                daemon=True
            )
            t.start()

            return jsonify(pending_response)

        except Exception as e:
            logging.error(f"❌ [BRIEF] Falha geral no Morning Brief: {e}", exc_info=True)
            return jsonify({"status": "Erro", "msg": str(e)}), 500






@simulation_bp.route('/api/simulation/correlation', methods=['GET'])
def sector_correlation():
    """🧮 Rota de Correlação: Retorna a matriz de correlação de Pearson entre ativos"""
    try:
        res = service.calculate_sector_correlation()
        return jsonify(res)
    except Exception as e:
        logging.error(f"❌ Erro ao computar matriz de correlação: {e}", exc_info=True)
        return jsonify({"status": "Erro", "msg": str(e)}), 500
