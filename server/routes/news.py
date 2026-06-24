# server/routes/news.py
from flask import Blueprint, jsonify
import feedparser
import requests
import logging
from urllib.parse import quote

news_bp = Blueprint('news', __name__)

@news_bp.route('/api/news/<ticker>', methods=['GET'])
def get_news(ticker):
    try:
        search_query = f"{ticker} mercado financeiro"
        encoded_query = quote(search_query)
        rss_url = f"https://news.google.com/rss/search?q={encoded_query}&hl=pt-BR&gl=BR&ceid=BR:pt-419"
        
        # 🛡️ ENGENHARIA DE REDE: feedparser.parse() nativo não possui controle confiável de timeout.
        # Baixamos os bytes do XML primeiro isolando a requisição com um teto rígido de 5 segundos.
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
        }
        
        response = requests.get(rss_url, headers=headers, timeout=5)
        
        if response.status_code != 200:
            logging.warning(f"⚠️ Google News retornou código de resposta inválido {response.status_code} para {ticker}")
            return jsonify([]), 200
            
        # Alimenta o parser diretamente com a string de bytes segura obtida em memória
        feed = feedparser.parse(response.content)
        
        news_list = []
        for entry in feed.entries[:5]:
            news_list.append({
                "title": entry.title,
                "link": entry.link,
                "published": entry.published,
                "source": entry.source.title if hasattr(entry, 'source') else "Google News"
            })
            
        return jsonify(news_list), 200

    except requests.exceptions.Timeout:
        # Se o Google News cair ou der lag, o Flask responde imediatamente uma lista vazia sem travar o app
        logging.error(f"⏳ TIMEOUT: Resposta do Google News excedeu 5s para o ticker {ticker}. Abortando.")
        return jsonify([]), 200
    except Exception as e:
        logging.error(f"❌ Erro operacional no barramento de notícias para {ticker}: {str(e)}")
        return jsonify([]), 200
