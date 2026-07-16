import os
import requests
import re
import logging
from flask import Blueprint, Response, request, jsonify
from curl_cffi import requests as cffi_requests
from bs4 import BeautifulSoup

assets_icon_bp = Blueprint('assets_icon', __name__)

ICONS_DIR = "/app/data/icons"
os.makedirs(ICONS_DIR, exist_ok=True)

def try_scrape_statusinvest(ticker):
    ticker = ticker.lower()
    for path in ['acoes', 'fundos-imobiliarios', 'bdrs']:
        url = f'https://statusinvest.com.br/{path}/{ticker}'
        try:
            res = cffi_requests.get(url, impersonate='chrome', timeout=5)
            if res.status_code == 200:
                soup = BeautifulSoup(res.text, 'html.parser')
                b = soup.find('div', class_='company-brand')
                if b and b.get('data-img'):
                    m = re.search(r"url\((.+?)\)", b.get('data-img'))
                    if m:
                        img_path = m.group(1)
                        if img_path.startswith('/'):
                            img_path = 'https://statusinvest.com.br' + img_path
                        img_res = requests.get(img_path, timeout=5)
                        if img_res.status_code == 200:
                            return img_res.content
        except Exception as e:
            logging.warning(f"StatusInvest scrape falhou em {url}: {e}")
    return None

def try_scrape_yfinance(ticker):
    try:
        import yfinance as yf
        t = ticker
        if t == 'BITCOIN': t = 'BTC-USD'
        elif not t.endswith('.SA') and not t.endswith('.US'): t = t + '.SA'
        info = yf.Ticker(t).info
        website = info.get('website')
        if website:
            from urllib.parse import urlparse
            domain = urlparse(website).netloc.replace('www.', '')
            cb_url = f"https://logo.clearbit.com/{domain}"
            img_res = requests.get(cb_url, timeout=5)
            if img_res.status_code == 200:
                return img_res.content
    except Exception as e:
        logging.warning(f"YFinance/Clearbit scrape falhou para {ticker}: {e}")
    return None

@assets_icon_bp.route('/api/assets/icon/<ticker>', methods=['GET'])
def get_asset_icon(ticker):
    """
    Retorna o ícone do ativo com prioridade:
    1. Arquivo Local (/data/icons)
    2. Repositório Monneda (GitHub)
    3. Scraper Automático na internet
    4. Fallback de Iniciais (UI-Avatars)
    """
    ticker = ticker.upper().strip()
    local_path = os.path.join(ICONS_DIR, f"{ticker}.png")
    
    # 1. Verifica disco local
    if os.path.exists(local_path):
        with open(local_path, "rb") as f:
            return Response(f.read(), mimetype='image/png', headers={'Cache-Control': 'public, max-age=86400'})

    # 2. Tenta repositório monneda
    primary_url = f"https://raw.githubusercontent.com/monneda/B3-Assets-Images/main/imgs/{ticker}.png"
    try:
        res = requests.get(primary_url, timeout=3)
        if res.status_code == 200:
            with open(local_path, "wb") as f:
                f.write(res.content)
            return Response(res.content, mimetype='image/png', headers={'Cache-Control': 'public, max-age=86400'})
    except Exception:
        pass

    # 3. Tenta Scrapers Automáticos (StatusInvest ou YFinance)
    content = try_scrape_statusinvest(ticker)
    if not content:
        content = try_scrape_yfinance(ticker)

    if content:
        with open(local_path, "wb") as f:
            f.write(content)
        return Response(content, mimetype='image/png', headers={'Cache-Control': 'public, max-age=86400'})

    # 4. Fallback final garantido (Cache menor, apenas 1 hora, para permitir que o usuário suba algo novo)
    fallback_url = f"https://ui-avatars.com/api/?name={ticker}&background=2A2E39&color=fff&size=128&bold=true"
    try:
        res_fall = requests.get(fallback_url, timeout=3)
        if res_fall.status_code == 200:
            return Response(res_fall.content, mimetype='image/png', headers={'Cache-Control': 'public, max-age=3600'})
    except Exception as e:
        logging.error(f"Erro no fallback para {ticker}: {e}")
        
    return "", 404

@assets_icon_bp.route('/api/assets/icon/<ticker>', methods=['POST'])
def upload_asset_icon(ticker):
    """
    Faz upload manual de um ícone para um ativo específico na base local.
    """
    ticker = ticker.upper().strip()
    if 'file' not in request.files:
        return jsonify({"status": "Erro", "msg": "Nenhum arquivo enviado."}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({"status": "Erro", "msg": "Arquivo vazio."}), 400
        
    try:
        local_path = os.path.join(ICONS_DIR, f"{ticker}.png")
        file.save(local_path)
        return jsonify({"status": "Sucesso", "msg": "Ícone salvo localmente com sucesso."})
    except Exception as e:
        logging.error(f"Erro ao salvar upload de {ticker}: {e}")
        return jsonify({"status": "Erro", "msg": str(e)}), 500
