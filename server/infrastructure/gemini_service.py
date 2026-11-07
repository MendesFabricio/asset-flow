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

        if not news_titles:
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
        news_list_str = "\n".join(f"- {title}" for title in news_titles)
        prompt = template.format(
            ticker=ticker,
            qty=qty,
            avg_price=avg_price,
            target_pct=target_pct,
            cvm_context_section=cvm_section,
            news_list=news_list_str
        )

        client = get_genai_client()
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.2
            )
        )

        response_text = response.text.strip()

        # Parse do JSON
        try:
            parsed = json.loads(response_text)
            rationale_raw = parsed.get("rationale", "")
            summary_raw = parsed.get("summary", "")
            sentiment_val = parsed.get("sentiment", "Neutro")

            if isinstance(rationale_raw, list):
                rationale_val = "\n".join(f"- {str(item).strip()}" for item in rationale_raw if item)
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
            summary = response_text
            sentiment = "Neutro"

        # 4. Salva no banco de dados
        asset.ai_summary = summary
        asset.ai_sentiment = sentiment
        asset.ai_status = "success"
        asset.ai_updated_at = datetime.now()
        session.commit()
        logging.info(f"✅ [IA] Sentimento de {ticker} atualizado com sucesso via Gemini!")

    except Exception as e:
        session.rollback()
        logging.error(f"❌ [IA] Falha na integração com Gemini para {ticker}: {e}")
        try:
            asset = session.query(Asset).filter_by(id=asset_id).first()
            if asset:
                asset.ai_status = "error"
                asset.ai_summary = f"Erro na análise de IA: {str(e)}"
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
