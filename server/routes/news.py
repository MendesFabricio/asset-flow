# server/routes/news.py
from flask import Blueprint, jsonify, request
import feedparser
import requests
import logging
from urllib.parse import quote
from datetime import datetime, timedelta
from database.models import Asset, safe_commit
from services import Session
from infrastructure.ollama_service import analyze_asset_sentiment_async
from utils.db_utils import with_safe_commit

news_bp = Blueprint('news', __name__)

@news_bp.route('/api/news/<ticker>', methods=['GET'])
@with_safe_commit
def get_news(ticker):
    from flask import request, g
    force_reanalyze = request.args.get("force", "false").lower() == "true"
    ticker_clean = ticker.strip().upper().replace(".SA", "")
    with Session() as session:
        try:
            # 1. Busca o Ativo no banco para vincular a IA
            asset = session.query(Asset).filter_by(ticker=ticker_clean).first()

            # 2. Busca notícias no Google News RSS
            search_query = f"{ticker_clean} mercado financeiro"
            encoded_query = quote(search_query)
            rss_url = f"https://news.google.com/rss/search?q={encoded_query}&hl=pt-BR&gl=BR&ceid=BR:pt-419"
            
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
            }
            
            news_list = []
            try:
                response = requests.get(rss_url, headers=headers, timeout=5)
                if response.status_code == 200:
                    feed = feedparser.parse(response.content)
                    for entry in feed.entries[:5]:
                        news_list.append({
                            "title": entry.title,
                            "link": entry.link,
                            "published": entry.published,
                            "source": entry.source.title if hasattr(entry, 'source') else "Google News"
                        })
            except requests.exceptions.Timeout:
                logging.error(f"⏳ TIMEOUT: RSS Google News excedeu 5s para o ticker {ticker_clean}.")
            except Exception as e:
                logging.error(f"⚠️ Erro ao obter RSS para {ticker_clean}: {e}")

            # 3. Controla estado da IA
            ai_data = {
                "summary": None,
                "sentiment": None,
                "status": "idle",
                "updated_at": None
            }

            if asset:
                should_trigger = False
                # 1. Se o usuário forçou a reanálise, sempre dispara
                if force_reanalyze:
                    should_trigger = True
                # 2. Se nunca foi executado (status idle ou None)
                elif asset.ai_status == "idle" or not asset.ai_status:
                    should_trigger = True
                # 3. Se deu erro na última execução, espera pelo menos 15 minutos antes de tentar novamente automaticamente
                elif asset.ai_status == "error":
                    if asset.ai_updated_at:
                        age = datetime.now() - asset.ai_updated_at
                        if age > timedelta(minutes=15):
                            should_trigger = True
                    else:
                        should_trigger = True
                # 4. Se estiver travado em "processing" há mais de 5 minutos, considera timeout e tenta novamente
                elif asset.ai_status == "processing":
                    if asset.ai_updated_at:
                        age = datetime.now() - asset.ai_updated_at
                        if age > timedelta(minutes=5):
                            should_trigger = True
                    else:
                        should_trigger = True
                # 5. Se foi um sucesso, respeita o cache padrão de 1 dia
                elif asset.ai_status == "success":
                    if asset.ai_updated_at:
                        age = datetime.now() - asset.ai_updated_at
                        if age > timedelta(days=1):
                            should_trigger = True
                    else:
                        should_trigger = True

                if should_trigger and news_list:
                    titles = [n["title"] for n in news_list]
                    
                    # Coleta dados estruturados da posição para repassar à IA
                    pos_qty = 0.0
                    pos_avg = 0.0
                    pos_target = 0.0
                    
                    from database.models import Position
                    user_id = getattr(g, 'user_id', None)
                    if user_id:
                        position = session.query(Position).filter_by(asset_id=asset.id, user_id=user_id).first()
                        if position:
                            pos_qty = float(position.quantity or 0.0)
                            pos_avg = float(position.average_price or 0.0)
                            pos_target = float(position.target_percent or 0.0)
                    
                    position_info = {
                        "quantity": pos_qty,
                        "average_price": pos_avg,
                        "target_percent": pos_target
                    }
                    
                    analyze_asset_sentiment_async(asset.id, asset.ticker, titles, position_info)
                    asset.ai_status = "processing"
                    asset.ai_updated_at = datetime.now()  # Registra o início do processamento como referência de timeout
                    safe_commit(session)
                elif should_trigger:
                    asset.ai_status = "idle"
                    asset.ai_updated_at = datetime.now()
                    safe_commit(session)

                ai_data = {
                    "summary": asset.ai_summary,
                    "sentiment": asset.ai_sentiment,
                    "status": asset.ai_status or "idle",
                    "updated_at": asset.ai_updated_at.isoformat() if asset.ai_updated_at else None
                }

            return jsonify({
                "news": news_list,
                "ai_sentiment": ai_data
            }), 200

        except Exception as e:
            logging.error(f"❌ Erro operacional no barramento de notícias para {ticker}: {str(e)}")
            return jsonify({"news": [], "ai_sentiment": {"status": "idle"}}), 200


@news_bp.route('/api/news/daily-summary', methods=['GET'])
def get_daily_sector_summary():
    from flask import request, g
    force_reanalyze = request.args.get("force", "false").lower() == "true"
    with Session() as session:
        try:
            from database.models import SystemCache, safe_commit
            import json
            
            # 1. Tenta recuperar do cache (expiração de 12 horas)
            cache_key = f"sector_news_summary_{g.user_id}"
            cache_record = session.query(SystemCache).filter_by(key=cache_key).first()
            if cache_record and not force_reanalyze:
                age = datetime.now() - cache_record.updated_at
                if age < timedelta(hours=12):
                    return jsonify(json.loads(cache_record.value))
                    
            # 2. Busca e compila notícias
            sectors = {
                "Ações": "https://news.google.com/rss/search?q=acoes+b3+bolsa+de+valores+ibovespa&hl=pt-BR&gl=BR&ceid=BR:pt-419",
                "FIIs": "https://news.google.com/rss/search?q=fundos+imobiliarios+fii+ifix&hl=pt-BR&gl=BR&ceid=BR:pt-419",
                "Cripto": "https://news.google.com/rss/search?q=criptomoedas+bitcoin+cripto+ethereum&hl=pt-BR&gl=BR&ceid=BR:pt-419"
            }
            
            summaries = {}
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
            }
            
            from infrastructure.ollama_service import OLLAMA_CHAT_URL, MODEL_NAME
            
            for sector, url in sectors.items():
                titles = []
                try:
                    response = requests.get(url, headers=headers, timeout=5)
                    if response.status_code == 200:
                        feed = feedparser.parse(response.content)
                        for entry in feed.entries[:6]:
                            titles.append(entry.title)
                except Exception as feed_err:
                    logging.warning(f"Erro ao buscar RSS para setor {sector}: {feed_err}")
                    
                if not titles:
                    summaries[sector] = "Sem notícias relevantes encontradas nas últimas horas."
                    continue
                    
                # Chama o Ollama para consolidar o sumário
                prompt = (
                    f"Você é o assistente financeiro Jarvis.\n"
                    f"Consolide os seguintes títulos de notícias recentes sobre o setor '{sector}' em um resumo de 2 ou 3 tópicos curtos e objetivos (máximo 60 palavras no total).\n"
                    f"Foque apenas no impacto financeiro relevante. Responda em português, usando bullet points simples (-).\n\n"
                    f"Títulos:\n" + "\n".join([f"- {t}" for t in titles])
                )
                
                payload = {
                    "model": MODEL_NAME,
                    "messages": [
                        {"role": "system", "content": "Você é o analista financeiro Jarvis. Retorne apenas o resumo em português."},
                        {"role": "user", "content": prompt}
                    ],
                    "stream": False,
                    "keep_alive": "5m"
                }
                
                try:
                    ai_res = requests.post(OLLAMA_CHAT_URL, json=payload, timeout=60)
                    if ai_res.status_code == 200:
                        summaries[sector] = ai_res.json().get("message", {}).get("content", "").strip()
                    else:
                        summaries[sector] = "Erro ao consolidar resumo do setor via IA."
                except Exception as ai_err:
                    logging.warning(f"Erro ao gerar resumo de {sector} no Ollama: {ai_err}")
                    summaries[sector] = "OLLAMA indisponível no momento."
                    
            # 3. Salva no cache
            result_data = {
                "status": "Sucesso",
                "summaries": summaries,
                "updated_at": datetime.now().isoformat()
            }
            
            if not cache_record:
                cache_record = SystemCache(key=cache_key)
                session.add(cache_record)
            cache_record.value = json.dumps(result_data)
            safe_commit(session)
            
            return jsonify(result_data)
        except Exception as e:
            logging.error(f"Erro geral no resumo setorial diário: {e}", exc_info=True)
            return jsonify({"status": "Erro", "msg": str(e)}), 500
