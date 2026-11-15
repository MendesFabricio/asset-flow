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
from db.models import Session, Asset, Position, SystemCache, safe_commit
from domain.quant.helpers import get_risk_free_rate
from infrastructure.gemini_service import MODEL_NAME, get_genai_client
from google import genai
from google.genai import types
from sqlalchemy.orm import joinedload
from routes.news import get_daily_sector_summary

simulation_bp = Blueprint('simulation', __name__)
service = PortfolioService()

# Constantes de timeout (reduzidas de 300s/240s/180s para valores seguros)
OLLAMA_TIMEOUT_BRIEF = 180
OLLAMA_TIMEOUT_DEFAULT = 60


def _fetch_portfolio_news_highlights(holdings: list[dict], max_items: int = 6) -> list[dict]:
    """Busca as principais notícias recentes relacionadas aos ativos da carteira via Google News RSS."""
    import feedparser
    from urllib.parse import quote_plus

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
    }
    queries: list[tuple[str, str]] = []
    for h in holdings:
        tkr = (h.get("ticker") or "").strip().upper()
        cat = (h.get("category") or "").strip()
        if not tkr or cat == "Reserva" or "NUBANK" in tkr or "CAIXINHA" in tkr:
            continue
        queries.append((tkr, f"{tkr} mercado financeiro OR dividendos OR resultado"))
        if len(queries) >= 4:
            break
    queries.append(("MACRO", "Ibovespa Selic dólar mercado hoje"))

    highlights: list[dict] = []
    seen_titles: set[str] = set()
    for tag, q in queries:
        try:
            url = f"https://news.google.com/rss/search?q={quote_plus(q)}&hl=pt-BR&gl=BR&ceid=BR:pt-419"
            resp = requests.get(url, headers=headers, timeout=4)
            if resp.status_code != 200:
                continue
            feed = feedparser.parse(resp.content)
            for entry in feed.entries[:2]:
                title = (getattr(entry, "title", "") or "").strip()
                link = (getattr(entry, "link", "") or "").strip()
                if not title or title in seen_titles:
                    continue
                seen_titles.add(title)
                source = ""
                if hasattr(entry, "source") and isinstance(entry.source, dict):
                    source = entry.source.get("title", "")
                highlights.append({
                    "ticker": tag,
                    "title": title,
                    "link": link,
                    "source": source,
                })
                if len(highlights) >= max_items:
                    return highlights
        except Exception as err:
            logging.debug(f"Falha ao buscar notícias de {tag} para Morning Brief: {err}")

    return highlights


def _build_morning_brief_context(user_id: int, dolar_rate: float, selic: float) -> dict:
    """Constrói contexto enriquecido para o Morning Brief (compartilhado entre rota e worker)."""
    # Delega lógica complexa de parseamento de ativos para o core (dashboard_data)
    service.current_user_id = user_id
    dashboard = service.get_dashboard_data()
    
    holdings_details = []
    for a in dashboard.get("ativos", []):
        holdings_details.append({
            "ticker": a.get("ticker", ""),
            "category": a.get("categoria", "Outros"),
            "value": a.get("total_atual", 0.0),
            "target_pct": a.get("target_percent", 0.0),
            "profit_loss_pct": a.get("variacao_pct", 0.0),
            "price": a.get("preco_atual", 0.0),
            "weight_pct": a.get("percentual_carteira", 0.0),
            "beta": "N/A",
            "var_95": "N/A"
        })

    holdings_details.sort(key=lambda x: x["value"], reverse=True)

    # Risk metrics computados
    risk = None
    try:
        # A sessão será criada no facade internamente
        service.current_user_id = user_id
        risk = service.calculate_risk_metrics()
    except Exception:
        pass

    enriched_holdings = []
    for h in holdings_details[:5]:
        enriched = dict(h)
        if risk and risk.get("status") == "Sucesso":
            enriched["beta"] = f"{risk.get('beta', 0):.2f}"
            enriched["var_95"] = f"{risk.get('var_95_monthly_pct', 0):.2f}%"
        enriched_holdings.append(enriched)

    news_highlights = _fetch_portfolio_news_highlights(holdings_details)

    context = {
        "selic": float(selic),
        "dolar_rate": round(float(dolar_rate), 2),
        "selic_rate": f"{selic * 100:.2f}%",
        "dolar_rate_str": f"R$ {float(dolar_rate):.2f}",
        "holdings": enriched_holdings,
        "all_holdings": holdings_details,
        "news_highlights": news_highlights,
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


def _sanitize_risk_metrics(raw_metrics: dict, selic: float, dolar_rate: float) -> dict:
    """Garante valores únicos e válidos em risk_metrics mesmo se o LLM ecoar opções separadas por '|'."""
    allowed = {
        "macro_regime": ("Juros Altos", "Transição", "Expansivo"),
        "fx_bias": ("Dólar Pressionado", "Neutro", "Favorável"),
        "posture": ("Defensiva", "Equilibrada", "Oportunista"),
    }
    defaults = {
        "macro_regime": "Juros Altos" if selic >= 0.11 else ("Transição" if selic >= 0.085 else "Expansivo"),
        "fx_bias": "Dólar Pressionado" if dolar_rate >= 5.75 else ("Favorável" if dolar_rate <= 5.10 else "Neutro"),
        "posture": "Defensiva" if selic >= 0.125 else "Equilibrada",
    }
    metrics = raw_metrics if isinstance(raw_metrics, dict) else {}
    cleaned = {}
    for key, options in allowed.items():
        val = str(metrics.get(key) or "").strip()
        if not val or "|" in val:
            cleaned[key] = defaults[key]
            continue
        matched = next((opt for opt in options if opt.lower() in val.lower()), None)
        cleaned[key] = matched if matched else defaults[key]
    return cleaned


def _run_morning_brief_bg(user_id: int, context: dict, cache_key: str):
    """Executa a chamada ao Gemini em thread de background e salva o resultado no cache."""
    from db.models import Session as DBSession, SystemCache, safe_commit
    try:
        prompt = _build_enhanced_morning_brief_prompt(context)
        
        try:
            from infrastructure.gemini_service import generate_ai_text
            raw_json, _provider = generate_ai_text(prompt=prompt, json_mode=True, temperature=0.2)
            parsed = json.loads(raw_json)
            
            brief_data = {
                "status": "Sucesso",
                "selic_rate": context.get("selic_rate", ""),
                "dolar_rate": context.get("dolar_rate", ""),
                "rationale": parsed.get("rationale", "") or "",
                "brief_text": parsed.get("brief_text", "") or "Morning Brief indisponível.",
                "action": parsed.get("action", "") or "",
                "risk_metrics": _sanitize_risk_metrics(
                    parsed.get("risk_metrics", {}),
                    float(context.get("selic", 0.0) or 0.0),
                    float(context.get("dolar_rate", 0.0) or 0.0),
                ),
                "news_highlights": context.get("news_highlights", []),
            }
            if not brief_data["brief_text"]:
                brief_data["brief_text"] = "Morning Brief indisponível."
        except Exception as e:
            logging.warning(f"⚠️ [BRIEF] Falha ao consultar IA. {e}")
            brief_data = {
                "status": "Erro",
                "selic_rate": context.get("selic_rate", ""),
                "dolar_rate": context.get("dolar_rate", ""),
                "rationale": "",
                "brief_text": "IA inativa ou respondendo com falha.",
                "action": "",
                "risk_metrics": {},
                "news_highlights": context.get("news_highlights", []),
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
    
    holdings_by_cat: dict[str, list[str]] = {}
    for h in (context.get("all_holdings") or context.get("holdings", [])):
        cat = h.get("category", "Outros")
        tkr = h.get("ticker", "")
        if tkr:
            holdings_by_cat.setdefault(cat, []).append(tkr)

    holdings_lines = []
    for cat, tickers in holdings_by_cat.items():
        sample = ", ".join(tickers[:6]) + ("..." if len(tickers) > 6 else "")
        if cat == "Reserva":
            holdings_lines.append(f"- Reserva (Caixa / Liquidez diária, NÃO é Renda Variável nem ativo descontado): {sample}")
        elif cat == "Renda Fixa":
            holdings_lines.append(f"- Renda Fixa (Títulos / ETFs de RF): {sample}")
        else:
            holdings_lines.append(f"- {cat} (Renda Variável): {sample}")
        
    holdings_text = "\n".join(holdings_lines) if holdings_lines else "Nenhuma posição ativa no momento."

    news_items = context.get("news_highlights") or []
    news_text = (
        "\n".join(f"- [{n.get('ticker', 'MERCADO')}] {n.get('title', '')}" for n in news_items)
        if news_items
        else "Sem notícias recentes encontradas para os ativos da carteira."
    )

    from utils.prompt_loader import load_prompt
    template = load_prompt("morning_brief_v1.txt")
    return template.format(
        date_str=date_str,
        selic_pct=selic_pct,
        dolar=dolar,
        holdings_text=holdings_text,
        news_text=news_text,
    )


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

            # Se há cache válido (< 12h) e com Sucesso e não forçou, retorna imediatamente
            if cache_record and not force_reanalyze:
                age = datetime.now() - cache_record.updated_at
                if age < timedelta(hours=12):
                    try:
                        cached_payload = json.loads(cache_record.value)
                        metrics_vals = " ".join(str(v) for v in (cached_payload.get("risk_metrics") or {}).values())
                        has_stale_fallback = cached_payload.get("selic_rate") == "10.50%" or "|" in metrics_vals
                        if cached_payload.get("status") == "Sucesso" and not has_stale_fallback:
                            return jsonify(cached_payload)
                    except Exception:
                        pass

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
                "risk_metrics": {},
                "news_highlights": context.get("news_highlights", []),
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


@simulation_bp.route('/api/simulation/tax-thermometer', methods=['GET'])
def tax_thermometer():
    """🌡️ Retorna termômetro da isenção de R$ 20k/mês em Ações e prejuízos acumulados."""
    from utils.db_utils import get_current_user_id
    user_id = get_current_user_id()
    try:
        from datetime import date as _date
        from domain.tax.tax_engine import simulate_sell_impact
        month = request.args.get('month', type=int) or _date.today().month
        year = request.args.get('year', type=int) or _date.today().year
        usd_rate = service.get_usd_rate()
        with Session() as session:
            res = simulate_sell_impact(session, user_id, sales=[], month=month, year=year, usd_rate=usd_rate)
            return jsonify(res), 200
    except Exception as e:
        logging.error(f"❌ Erro ao gerar termômetro tributário: {e}", exc_info=True)
        return jsonify({"status": "Erro", "msg": str(e)}), 500


@simulation_bp.route('/api/simulation/sell', methods=['POST'])
def simulate_sell_route():
    """🧮 Simula venda parcial/total, cálculo de DARF, isenção de R$ 20k e Tax-Loss Harvesting."""
    from utils.db_utils import get_current_user_id
    user_id = get_current_user_id()
    try:
        from datetime import date as _date
        from domain.tax.tax_engine import simulate_sell_impact
        body = request.get_json(silent=True) or {}
        sales = body.get('sales')
        if not isinstance(sales, list):
            return jsonify({"status": "Erro", "msg": "Campo 'sales' deve ser uma lista."}), 400
        month = body.get('month') or _date.today().month
        year = body.get('year') or _date.today().year
        usd_rate = service.get_usd_rate()
        with Session() as session:
            res = simulate_sell_impact(
                session,
                user_id,
                sales=sales,
                month=int(month),
                year=int(year),
                usd_rate=usd_rate,
            )
            return jsonify(res), 200
    except Exception as e:
        logging.error(f"❌ Erro na simulação de venda: {e}", exc_info=True)
        return jsonify({"status": "Erro", "msg": str(e)}), 500
