from flask import Blueprint, jsonify
from database.models import Asset, Position, Session
import yfinance as yf
from datetime import datetime
import pytz
import logging
import time
import requests
from requests.adapters import HTTPAdapter
from urllib3.util import Retry
from concurrent.futures import ThreadPoolExecutor, as_completed

calendar_bp = Blueprint('calendar', __name__)

CALENDAR_CACHE = {
    "data": None,
    "last_update": 0
}
CACHE_TIMEOUT = 600  # 10 minutos

def get_secure_session():
    """🛡️ Cria uma sessão HTTP disfarçada de navegador com pool expandido para threads"""
    session = requests.Session()
    retries = Retry(total=2, backoff_factor=0.3, status_forcelist=[500, 502, 503, 504])
    
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
    })
    
    # ⚡ Calibração ideal: Pool de 20 slots casa perfeitamente com os 12 workers paralelos
    adapter = HTTPAdapter(
        max_retries=retries,
        pool_connections=20,
        pool_maxsize=20
    )
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session

def fetch_single_asset_proventos(item, secure_session):
    """🛠️ TRABALHADOR: Reutiliza a sessão única injetada para evitar conflito de Crumbs/401"""
    ticker_raw, quantity, today, tz = item
    local_events = []
    
    try:
        if len(ticker_raw) >= 5 and not ticker_raw.endswith('.SA'):
            ticker_yahoo = f"{ticker_raw}.SA"
        else:
            ticker_yahoo = ticker_raw
        
        # ⚡ O SEGREDO: O Ticker agora usa a sessão compartilhada que já possui o Cookie válido
        stock = yf.Ticker(ticker_yahoo, session=secure_session)
        
        # 1. Histórico de Dividendos
        divs = stock.dividends
        if not divs.empty:
            if divs.index.tz is None: 
                divs.index = divs.index.tz_localize(tz)
            else: 
                divs.index = divs.index.tz_convert(tz)

            future_divs = divs[divs.index.date >= today]
            for date_com, value in future_divs.items():
                local_events.append({
                    "ticker": ticker_raw,
                    "date": date_com.strftime('%Y-%m-%d'),
                    "total": float(value) * float(quantity),
                    "value_per_share": float(value),
                    "status": "Confirmado",
                    "is_estimate": False
                })

        # 2. Info Corporativa (Anunciados)
        if not local_events:
            info = stock.info
            ex_ts = info.get('exDividendDate')
            if ex_ts:
                ex_date = datetime.fromtimestamp(ex_ts, tz).date()
                if ex_date >= today:
                    val = info.get('dividendRate') or (divs.iloc[-1] if not divs.empty else 0)
                    if val > 0:
                        local_events.append({
                            "ticker": ticker_raw,
                            "date": ex_date.strftime('%Y-%m-%d'),
                            "total": float(val) * float(quantity),
                            "value_per_share": float(val),
                            "status": "Anunciado",
                            "is_estimate": True
                        })
    except Exception as e:
        logging.warning(f"   ⚠️ Falha controlada ao buscar {ticker_raw} em paralelo: {e}")
        
    return local_events

@calendar_bp.route('/api/calendar', methods=['GET'])
def get_calendar():
    now = time.time()
    
    if CALENDAR_CACHE["data"] is not None and (now - CALENDAR_CACHE["last_update"]) < CACHE_TIMEOUT:
        return jsonify(CALENDAR_CACHE["data"])

    logging.info("🔍 --- INICIANDO BUSCA ULTRA-RÁPIDA DE PROVENTOS (SESSÃO INJETADA) ---")
    
    tz = pytz.timezone("America/Sao_Paulo")
    today = datetime.now(tz).date()
    items_to_process = []
    
    with Session() as session:
        try:
            positions = session.query(Position).join(Asset).filter(Position.quantity > 0).all()
            for pos in positions:
                ticker_raw = pos.asset.ticker.strip().upper()
                if any(x in ticker_raw for x in ["CAIXINHA", "BTC", "ETH"]):
                    continue
                items_to_process.append((ticker_raw, pos.quantity, today, tz))
        except Exception as e:
            logging.error(f"💥 Erro ao ler posições para o calendário: {e}")
            return jsonify({"error": "Erro de banco de dados"}), 500

    if not items_to_process:
        return jsonify([])

    events = []
    
    # ⚡ PASSO CRUCIAL: Instancia a sessão segura UMA vez aqui na thread principal do Flask
    secure_session = get_secure_session()
    
    # Prorrogamos um hit leve inicial para a sessão carregar o primeiro par de cookies de forma síncrona
    try:
        secure_session.get("https://fc.yahoo.com", timeout=5)
    except:
        pass

    # Dispara o pool passando a sessão única compartilhada como argumento fixo
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = [executor.submit(fetch_single_asset_proventos, item, secure_session) for item in items_to_process]
        
        for future in as_completed(futures):
            events.extend(future.result())

    events.sort(key=lambda x: x['date'])
    
    CALENDAR_CACHE["data"] = events
    CALENDAR_CACHE["last_update"] = now
    
    logging.info(f"🏁 Fim da varredura paralela protegida. {len(events)} eventos consolidados.")
    return jsonify(events)
