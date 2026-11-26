"""
infrastructure/gemini_service.py
Integração assíncrona com API do Google Gemini
para análise de sentimento consciente da carteira (portfolio-aware) e saída estruturada.
"""
import logging
import threading
import json
import os
import sys
from datetime import datetime
from sqlalchemy.orm import sessionmaker
from google import genai
from google.genai import types

from db.models import engine, Asset

SessionLocal = sessionmaker(bind=engine)

MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

def get_genai_client():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        is_testing = os.getenv("FLASK_ENV") == "testing" or "pytest" in sys.modules
        if is_testing:
            logging.warning("⚠️ GEMINI_API_KEY não encontrada no ambiente de teste! Retornando None.")
            return None
        else:
            raise ValueError("GEMINI_API_KEY não configurada no ambiente! Adicione a chave no arquivo .env.")
    return genai.Client(api_key=api_key)


def generate_ai_text(
    prompt: str,
    system_prompt: str | None = None,
    json_mode: bool = False,
    temperature: float = 0.2,
) -> tuple[str, str]:
    """Gera texto usando Gemini quando configurado ou Ollama local como fallback."""
    api_key = (os.getenv("GEMINI_API_KEY") or "").strip()
    if api_key:
        try:
            client = get_genai_client()
            if client is not None:
                cfg_kwargs = {"temperature": temperature}
                if json_mode:
                    cfg_kwargs["response_mime_type"] = "application/json"
                if system_prompt:
                    cfg_kwargs["system_instruction"] = system_prompt
                response = client.models.generate_content(
                    model=MODEL_NAME,
                    contents=prompt,
                    config=types.GenerateContentConfig(**cfg_kwargs),
                )
                return (response.text or "").strip(), "gemini"
        except Exception as exc:
            logging.warning(f"⚠️ Gemini falhou ({exc}); tentando fallback para Ollama local...")

    from infrastructure.local_ai import generate_ollama_completion

    text = generate_ollama_completion(
        prompt=prompt,
        system_prompt=system_prompt,
        json_mode=json_mode,
    )
    return text, "ollama"

def get_gemini_tools() -> list:
    """
    Retorna as definições das ferramentas compatíveis com o SDK do Google Generative AI.
    """
    return [
        {
            "function_declarations": [
                {
                    "name": "query_portfolio_metrics",
                    "description": "Devolve as métricas de alocação de carteira, saldo total, devedores/recebíveis, posições ativas, além de todas as métricas quantitativas de risco calculadas pelo sistema (VaR, Sharpe, Beta, Max Drawdown).",
                    "parameters": {
                        "type": "OBJECT",
                        "properties": {}
                    }
                },
                {
                    "name": "get_asset_fundamental_data",
                    "description": "Devolve o bloco de demonstrativos da CVM e múltiplos fundamentalistas exatos indexados ao ticker corporativo fornecido.",
                    "parameters": {
                        "type": "OBJECT",
                        "properties": {
                            "ticker": {
                                "type": "STRING",
                                "description": "O ticker da ação ou FII a ser consultado (ex: WEGE3, PETR4, MXRF11)."
                            }
                        },
                        "required": ["ticker"]
                    }
                }
            ]
        }
    ]

def _normalize_news_items(news_input: list) -> list[dict]:
    """Normaliza entrada de notícias (strings ou dicts com title/link/source)."""
    items = []
    for entry in news_input or []:
        if isinstance(entry, dict):
            title = str(entry.get("title") or "").strip()
            if not title:
                continue
            items.append({
                "title": title,
                "link": str(entry.get("link") or "").strip(),
                "source": str(entry.get("source") or "Fonte").strip(),
            })
        else:
            title = str(entry or "").strip()
            if title:
                items.append({"title": title, "link": "", "source": "Fonte"})
    return items


def _format_rationale_item(item, news_items: list[dict]) -> str:
    """Formata um tópico do rationale anexando botão/link da notícia de origem quando disponível."""
    import re
    source_idx = None
    if isinstance(item, dict):
        text = str(item.get("text") or item.get("ponto") or item.get("summary") or "").strip()
        raw_idx = item.get("source_index")
        if isinstance(raw_idx, int):
            source_idx = raw_idx
        elif isinstance(raw_idx, str) and raw_idx.strip().isdigit():
            source_idx = int(raw_idx.strip())
    else:
        text = str(item or "").strip()
        m_start = re.match(r'^\[(\d+)\]\s*', text)
        m_end = re.search(r'\s*\[(\d+)\]\s*\.?$', text)
        if m_start:
            source_idx = int(m_start.group(1))
            text = text[m_start.end():].strip()
        elif m_end:
            source_idx = int(m_end.group(1))
            text = text[:m_end.start()].strip()

    if not text:
        return ""

    chosen = None
    if source_idx is not None and 1 <= source_idx <= len(news_items):
        chosen = news_items[source_idx - 1]
    else:
        text_low = text.lower()
        for n in news_items:
            src = n.get("source", "")
            if src and src != "Fonte" and src.lower() in text_low:
                chosen = n
                break

    if chosen and chosen.get("link", "").startswith(("http://", "https://")):
        label = chosen.get("source") or "Fonte"
        return f"- {text} [{label} ↗]({chosen['link']})"
    return f"- {text}"


def _run_sentiment_analysis(asset_id: int, ticker: str, news_titles: list, position_info: dict):
    """
    Worker que roda na thread de background para consultar o Gemini
    e salvar o resultado no banco.
    """
    logging.info(f"🤖 [IA] Iniciando análise de sentimento consciente da carteira para: {ticker} via Gemini")
    session = SessionLocal()
    try:
        asset = session.query(Asset).filter_by(id=asset_id).first()
        if not asset:
            logging.warning(f"⚠️ [IA] Ativo {ticker} não encontrado no banco.")
            return

        # 1. Atualiza status para processing
        asset.ai_status = "processing"
        asset.ai_updated_at = datetime.now()
        session.commit()

        news_items = _normalize_news_items(news_titles)
        if not news_items:
            asset.ai_summary = "Nenhuma notícia recente disponível para análise."
            asset.ai_sentiment = "Neutro"
            asset.ai_status = "success"
            asset.ai_updated_at = datetime.now()
            session.commit()
            return

        # 2. Constrói o Prompt Consciente de Portfolio
        qty = position_info.get("quantity", 0.0)
        avg_price = position_info.get("average_price", 0.0)
        target_pct = position_info.get("target_percent", 0.0)
        
        cvm_context = ""
        if asset.cvm_code:
            try:
                from utils.cvm_processor import CVMProcessor
                cvm_data = CVMProcessor.get_dashboard_data(asset.cvm_code)
                if cvm_data:
                    info = cvm_data.get("ticker_info", {})
                    cards = cvm_data.get("cards_indicadores", [])
                    metrics_str = ", ".join([f"{c['titulo']}: {c.get('valor_formatado') or c.get('valor')}" for c in cards])
                    cvm_context = (
                        f"Últimos demonstrativos CVM (Data-base: {info.get('data_base')}, Período: {info.get('ultimo_periodo')}):\n"
                        f"{metrics_str}"
                    )
            except Exception as cvm_err:
                pass
        
        from utils.prompt_loader import load_prompt
        template = load_prompt("sentiment_analysis_v1.txt")
        cvm_section = f"=== CONTEXTO ADICIONAL DE EVENTOS CVM ===\n{cvm_context}\n\n" if cvm_context else ""
        news_list_str = "\n".join(
            f"[{idx}] ({n['source']}) {n['title']}" for idx, n in enumerate(news_items, start=1)
        )
        prompt = template.format(
            ticker=ticker,
            qty=qty,
            avg_price=avg_price,
            target_pct=target_pct,
            cvm_context_section=cvm_section,
            news_list=news_list_str
        )

        response_text, provider = generate_ai_text(
            prompt=prompt,
            json_mode=True,
            temperature=0.2,
        )

        # Parse do JSON
        parse_ok = True
        try:
            parsed = json.loads(response_text)
            rationale_raw = parsed.get("rationale", "")
            summary_raw = parsed.get("summary", "")
            sentiment_val = parsed.get("sentiment", "Neutro")

            if isinstance(rationale_raw, list):
                formatted_items = [_format_rationale_item(item, news_items) for item in rationale_raw if item]
                rationale_val = "\n".join(line for line in formatted_items if line)
            else:
                rationale_val = str(rationale_raw).strip()

            if isinstance(summary_raw, list):
                summary_val = "\n".join(str(item).strip() for item in summary_raw if item)
            else:
                summary_val = str(summary_raw).strip()
            
            summary = f"**Análise de Risco (CoT):**\n{rationale_val}\n\n**Resumo Executivo:**\n{summary_val}"
            sentiment = str(sentiment_val).strip().title()
            if sentiment not in ["Positivo", "Negativo", "Neutro"]:
                sentiment = "Neutro"
        except Exception as parse_err:
            logging.warning(f"⚠️ [IA] Falha ao processar resposta JSON estruturada do Gemini para {ticker}: {parse_err}")
            parse_ok = False
            summary = "Não foi possível estruturar a análise de sentimento no momento."
            sentiment = "Neutro"

        # 4. Salva no banco de dados
        asset.ai_summary = summary
        asset.ai_sentiment = sentiment
        asset.ai_status = "success" if parse_ok else "error"
        asset.ai_updated_at = datetime.now()
        session.commit()
        logging.info(f"✅ [IA] Sentimento de {ticker} atualizado com sucesso via {provider}!")

    except Exception as e:
        session.rollback()
        logging.error(f"❌ [IA] Falha na integração com Gemini para {ticker}: {e}")
        try:
            asset = session.query(Asset).filter_by(id=asset_id).first()
            if asset:
                asset.ai_status = "error"
                asset.ai_summary = None
                session.commit()
        except Exception:
            pass
    finally:
        session.close()

def analyze_asset_sentiment_async(asset_id: int, ticker: str, news_titles: list, position_info: dict):
    """
    Dispara a análise de IA em uma thread de background isolada.
    """
    thread = threading.Thread(
        target=_run_sentiment_analysis,
        args=(asset_id, ticker, news_titles, position_info),
        daemon=True
    )
    thread.start()
