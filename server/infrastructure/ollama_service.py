"""
infrastructure/ollama_service.py
Integração assíncrona com micro-LLM Ollama (phi3 ou qwen2.5:1.5b)
para análise de sentimento consciente da carteira (portfolio-aware) e saída estruturada.
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
MODEL_NAME = "qwen2.5:1.5b"  # Modelo leve para hardware restrito

def _run_sentiment_analysis(ticker: str, news_titles: list, position_info: dict):
    """
    Worker que roda na thread de background para consultar o Ollama local
    e salvar o resultado no banco.
    """
    logging.info(f"🤖 [IA] Iniciando análise de sentimento consciente da carteira para: {ticker}")
    session = SessionLocal()
    try:
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

        # 2. Constrói o Prompt Consciente de Portfolio (Portfolio-Aware)
        qty = position_info.get("quantity", 0.0)
        avg_price = position_info.get("average_price", 0.0)
        target_pct = position_info.get("target_percent", 0.0)
        
        prompt = (
            f"Você é um analista financeiro sênior especializado em inteligência de mercado do ativo {ticker} brasileiro.\n"
            f"Sua missão é assessorar o investidor avaliando o impacto das notícias frente à sua exposição financeira real no ativo {ticker}:\n"
            f"Exposição do Investidor em {ticker}:\n"
            f"- Quantidade em Carteira: {qty:.2f} cotas/ações\n"
            f"- Preço Médio de Aquisição: R$ {avg_price:.2f}\n"
            f"- Meta de Alocação de Portfólio: {target_pct:.1f}%\n\n"
            f"Notícias recentes coletadas:\n"
            + "\n".join(f"- {title}" for title in news_titles) + "\n\n"
            f"Regras estritas de comportamento:\n"
            f"1. A análise do raciocínio técnico ('rationale') deve focar exclusivamente em {ticker} e ponderar as notícias frente à quantidade e custo médio do investidor.\n"
            f"2. NUNCA faça comentários macro generalistas sobre o mercado global ou outras empresas.\n"
            f"3. Responda estritamente em formato JSON contendo exatamente as chaves a seguir:\n"
            f"   - 'rationale': Uma análise Chain-of-Thought (Cadeia de Pensamento) detalhada em português ponderando risco, preço médio e notícias.\n"
            f"   - 'summary': Um resumo executivo conciso em português do impacto direto sobre o ativo {ticker} (máximo 2 parágrafos).\n"
            f"   - 'sentiment': Classificação de sentimento do ativo {ticker} (exclusivamente entre: 'Positivo', 'Negativo', 'Neutro').\n"
        )

        payload = {
            "model": MODEL_NAME,
            "prompt": prompt,
            "format": "json",
            "stream": False,
            "keep_alive": 0
        }
        
        # Timeout preventivo de 45 segundos para conexões restritas
        response = requests.post(OLLAMA_URL, json=payload, timeout=45)
        
        if response.status_code != 200:
            raise Exception(f"Ollama respondeu com status {response.status_code}")

        res_data = response.json()
        response_text = res_data.get("response", "").strip()

        # Parse direto do JSON forçado nativamente pelo Ollama
        try:
            parsed = json.loads(response_text)
            rationale_val = parsed.get("rationale", "")
            summary_val = parsed.get("summary", "")
            sentiment_val = parsed.get("sentiment", "Neutro")
            
            # Formata a resposta concatenando rationale e o resumo de forma limpa para exibição
            summary = f"**Análise de Risco (CoT):**\n{rationale_val}\n\n**Resumo Executivo:**\n{summary_val}"
            sentiment = str(sentiment_val).strip().title()
            if sentiment not in ["Positivo", "Negativo", "Neutro"]:
                sentiment = "Neutro"
        except Exception as parse_err:
            logging.warning(f"⚠️ [IA] Falha ao processar resposta JSON estruturada para {ticker}: {parse_err}")
            summary = response_text
            sentiment = "Neutro"

        # 4. Salva no banco de dados
        asset.ai_summary = summary
        asset.ai_sentiment = sentiment
        asset.ai_status = "success"
        asset.ai_updated_at = datetime.now()
        session.commit()
        logging.info(f"✅ [IA] Sentimento de {ticker} atualizado com sucesso!")

    except Exception as e:
        session.rollback()
        logging.error(f"❌ [IA] Falha na integração com Ollama para {ticker}: {e}")
        try:
            asset = session.query(Asset).filter_by(ticker=ticker).first()
            if asset:
                asset.ai_status = "error"
                asset.ai_summary = f"Erro na análise de IA: {str(e)}"
                session.commit()
        except Exception:
            pass
    finally:
        session.close()

def analyze_asset_sentiment_async(ticker: str, news_titles: list, position_info: dict):
    """
    Dispara a análise de IA em uma thread de background isolada.
    """
    thread = threading.Thread(
        target=_run_sentiment_analysis,
        args=(ticker, news_titles, position_info),
        daemon=True
    )
    thread.start()
