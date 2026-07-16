"""
infrastructure/ollama_service.py
Integração assíncrona com micro-LLM Ollama (Llama 3.2:3b)
para análise de sentimento consciente da carteira (portfolio-aware) e saída estruturada.
"""
import logging
import threading
import json
from datetime import datetime
import requests
from sqlalchemy.orm import sessionmaker
from db.models import engine, Asset

SessionLocal = sessionmaker(bind=engine)

import os

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://ollama:11434").rstrip("/")
OLLAMA_URL = f"{OLLAMA_BASE_URL}/api/generate"
OLLAMA_CHAT_URL = f"{OLLAMA_BASE_URL}/api/chat"
MODEL_NAME = os.getenv("OLLAMA_MODEL", "llama3.2:3b")  # Modelo leve para hardware restrito

def get_ollama_tools() -> list:
    """
    Retorna as definições das ferramentas compatíveis com a API de ferramentas do Ollama (JSON Schema oficial).
    """
    return [
        {
            "type": "function",
            "function": {
                "name": "query_portfolio_metrics",
                "description": "Devolve as métricas de alocação de carteira, saldo total, devedores/recebíveis, posições ativas, além de todas as métricas quantitativas de risco calculadas pelo sistema (VaR, Sharpe, Beta, Max Drawdown).",
                "parameters": {
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "get_asset_fundamental_data",
                "description": "Devolve o bloco de demonstrativos da CVM e múltiplos fundamentalistas exatos indexados ao ticker corporativo fornecido.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "ticker": {
                            "type": "string",
                            "description": "O ticker da ação ou FII a ser consultado (ex: WEGE3, PETR4, MXRF11)."
                        }
                    },
                    "required": ["ticker"]
                }
            }
        }
    ]

def _run_sentiment_analysis(asset_id: int, ticker: str, news_titles: list, position_info: dict):
    """
    Worker que roda na thread de background para consultar o Ollama local
    e salvar o resultado no banco.
    """
    logging.info(f"🤖 [IA] Iniciando análise de sentimento consciente da carteira para: {ticker}")
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

        # 2. Constrói o Prompt Consciente de Portfolio (Portfolio-Aware)
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
        
        prompt = (
            f"Você é um analista financeiro sênior especializado em inteligência de mercado do ativo {ticker} brasileiro.\n"
            f"Sua missão é assessorar o investidor avaliando o impacto das notícias frente à sua exposição financeira real no ativo {ticker}:\n"
            f"Exposição do Investidor em {ticker}:\n"
            f"- Quantidade em Carteira: {qty:.2f} cotas/ações\n"
            f"- Preço Médio de Aquisição: R$ {avg_price:.2f}\n"
            f"- Meta de Alocação de Portfólio: {target_pct:.1f}%\n\n"
        )
        if cvm_context:
            prompt += f"=== CONTEXTO ADICIONAL DE EVENTOS CVM ===\n{cvm_context}\n\n"

        prompt += (
            "Notícias recentes coletadas:\n"
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
            "keep_alive": "5m"
        }
        
        # Timeout preventivo estendido para 180 segundos para acomodar inferências lentas em CPU
        response = requests.post(OLLAMA_URL, json=payload, timeout=180)
        
        if response.status_code != 200:
            raise Exception(f"Ollama respondeu com status {response.status_code}")

        res_data = response.json()
        response_text = res_data.get("response", "").strip()

        # Parse direto do JSON forçado nativamente pelo Ollama
        try:
            parsed = json.loads(response_text)
            rationale_raw = parsed.get("rationale", "")
            summary_raw = parsed.get("summary", "")
            sentiment_val = parsed.get("sentiment", "Neutro")

            # Trata respostas do LLM caso retornem em formato de listas/vetores JSON
            if isinstance(rationale_raw, list):
                rationale_val = "\n".join(f"- {str(item).strip()}" for item in rationale_raw if item)
            else:
                rationale_val = str(rationale_raw).strip()

            if isinstance(summary_raw, list):
                summary_val = "\n".join(str(item).strip() for item in summary_raw if item)
            else:
                summary_val = str(summary_raw).strip()
            
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
