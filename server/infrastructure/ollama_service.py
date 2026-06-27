"""
infrastructure/ollama_service.py
Integração assíncrona com micro-LLM Ollama (phi3 ou qwen2:1.5b)
para análise de sentimento e resumos de notícias sem bloquear a thread principal.
"""
import logging
import threading
import json
from datetime import datetime
import requests
from sqlalchemy.orm import sessionmaker
from database.models import engine, Asset

SessionLocal = sessionmaker(bind=engine)

OLLAMA_URL = "http://host.docker.internal:11434/api/generate"
MODEL_NAME = "qwen2.5:1.5b"  # Modelo alvo leve para hardware restrito

def _run_sentiment_analysis(ticker: str, news_titles: list):
    """
    Worker que roda na thread de background para consultar o Ollama local
    e salvar o resultado no banco.
    """
    logging.info(f"🤖 [IA] Iniciando análise de sentimento via Ollama para: {ticker}")
    session = SessionLocal()
    try:
        # Busca o ativo
        asset = session.query(Asset).filter_by(ticker=ticker).first()
        if not asset:
            logging.warning(f"⚠️ [IA] Ativo {ticker} não encontrado no banco.")
            return

        # 1. Atualiza status para processing
        asset.ai_status = "processing"
        session.commit()

        if not news_titles:
            asset.ai_summary = "Nenhuma notícia recente disponível para análise."
            asset.ai_sentiment = "Neutro"
            asset.ai_status = "success"
            asset.ai_updated_at = datetime.now()
            session.commit()
            return

        # 2. Constrói o Prompt
        prompt = (
            f"Você é um analista financeiro sênior especializado no mercado brasileiro. "
            f"Analise os seguintes títulos de notícias recentes para o ativo {ticker}:\n"
            + "\n".join(f"- {title}" for title in news_titles) + "\n\n"
            f"Responda EXCLUSIVAMENTE em formato JSON puro, contendo exatamente duas chaves:\n"
            f"1. 'summary': Um resumo executivo conciso em português (máximo de 2 parágrafos) dos principais temas abordados e impactos para o ativo.\n"
            f"2. 'sentiment': Uma classificação de sentimento em uma única palavra (entre: 'Positivo', 'Negativo', 'Neutro').\n"
            f"Não adicione nenhuma introdução, marcação de markdown (como ```json) ou texto antes/depois do JSON."
        )

        payload = {
            "model": MODEL_NAME,
            "prompt": prompt,
            "stream": False,
            "keep_alive": 0
        }
        
        response = requests.post(OLLAMA_URL, json=payload, timeout=45)
        
        if response.status_code != 200:
            raise Exception(f"Ollama respondeu com status {response.status_code}")

        res_data = response.json()
        response_text = res_data.get("response", "").strip()

        # Remove possíveis wraps do markdown se o modelo ignorar a instrução
        if response_text.startswith("```json"):
            response_text = response_text.split("```json")[1]
        if response_text.endswith("```"):
            response_text = response_text.rsplit("```", 1)[0]
        response_text = response_text.strip()

        # Tenta parsear a resposta
        try:
            parsed = json.loads(response_text)
            
            # Tenta chaves em inglês e português
            summary_val = parsed.get("summary") or parsed.get("resumo_executivo") or parsed.get("resumo")
            sentiment_val = parsed.get("sentiment") or parsed.get("classificação_sentimento") or parsed.get("sentimento")
            
            # Fallback se vier chaves dinâmicas
            if not summary_val and parsed:
                summary_val = list(parsed.values())[0]
            if not sentiment_val and parsed and len(parsed) > 1:
                sentiment_val = list(parsed.values())[1]

            # Trata casos em que o valor em si é outro dicionário
            if isinstance(summary_val, dict):
                summary = summary_val.get("resumo_executivo") or summary_val.get("summary") or list(summary_val.values())[0]
            else:
                summary = str(summary_val or "")

            if isinstance(sentiment_val, dict):
                sentiment = sentiment_val.get("classificação_sentimento") or sentiment_val.get("sentiment") or list(sentiment_val.values())[0]
            else:
                sentiment = str(sentiment_val or "Neutro")

            sentiment = sentiment.strip().title()
            if sentiment not in ["Positivo", "Negativo", "Neutro"]:
                sentiment = "Neutro"
        except Exception:
            # Fallback se a LLM não cuspir JSON válido
            logging.warning(f"⚠️ [IA] Ollama não retornou JSON válido para {ticker}. Usando parse manual.")
            summary = response_text
            sentiment = "Neutro"
            if "positivo" in response_text.lower():
                sentiment = "Positivo"
            elif "negativo" in response_text.lower():
                sentiment = "Negativo"

        # 4. Salva no banco de dados
        asset.ai_summary = summary
        asset.ai_sentiment = sentiment
        asset.ai_status = "success"
        asset.ai_updated_at = datetime.now()
        session.commit()
        logging.info(f"✅ [IA] Sentimento de {ticker} atualizado: {sentiment}")

    except Exception as e:
        session.rollback()
        logging.error(f"❌ [IA] Falha na integração com Ollama para {ticker}: {e}")
        try:
            # Atualiza status para erro em caso de falha física (ex: Ollama offline)
            asset = session.query(Asset).filter_by(ticker=ticker).first()
            if asset:
                asset.ai_status = "error"
                asset.ai_summary = f"Erro na análise de IA: {str(e)}"
                session.commit()
        except Exception:
            pass
    finally:
        session.close()

def analyze_asset_sentiment_async(ticker: str, news_titles: list):
    """
    Dispara a análise de IA em uma thread de background isolada.
    Garante que a rota HTTP principal do Flask responda na hora.
    """
    thread = threading.Thread(
        target=_run_sentiment_analysis,
        args=(ticker, news_titles),
        daemon=True
    )
    thread.start()
