# server/routes/news.py
from flask import Blueprint, jsonify
import feedparser
import requests
import logging
from urllib.parse import quote
from datetime import datetime, timedelta
from database.models import Asset
from services import Session
from infrastructure.ollama_service import analyze_asset_sentiment_async

news_bp = Blueprint('news', __name__)

@news_bp.route('/api/news/<ticker>', methods=['GET'])
def get_news(ticker):
    from flask import request
    force_reanalyze = request.args.get("force", "false").lower() == "true"
    ticker_clean = ticker.strip().upper().replace(".SA", "")
    session = Session()
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
                if asset.position:
                    pos_qty = float(asset.position.quantity or 0.0)
                    pos_avg = float(asset.position.average_price or 0.0)
                    pos_target = float(asset.position.target_percent or 0.0)
                
                position_info = {
                    "quantity": pos_qty,
                    "average_price": pos_avg,
                    "target_percent": pos_target
                }
                
                analyze_asset_sentiment_async(asset.ticker, titles, position_info)
                asset.ai_status = "processing"
                asset.ai_updated_at = datetime.now()  # Registra o início do processamento como referência de timeout
                session.commit()
            elif should_trigger:
                asset.ai_status = "idle"
                asset.ai_updated_at = datetime.now()
                session.commit()

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
    finally:
        Session.remove()
