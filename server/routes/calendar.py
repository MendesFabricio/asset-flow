from flask import Blueprint, jsonify, g
from db.models import Asset, Position, Session, Dividend
from utils.ticker_helper import to_yf_ticker
import yfinance as yf
from datetime import datetime
import pytz
import logging
import time
import requests
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from utils.http_client import get_secure_session

calendar_bp = Blueprint('calendar', __name__)

CALENDAR_CACHE = {}  # Cache por user_id: {user_id: {"data": [...], "last_update": time.time()}}
CACHE_TIMEOUT = 600  # 10 minutos
CALENDAR_UPDATE_LOCK = threading.Lock()
IS_UPDATING_CALENDAR = False



def fetch_single_asset_proventos(item, secure_session):
    """🛠️ TRABALHADOR: Reutiliza a sessão única injetada para evitar conflito de Crumbs/401"""
    ticker_raw, quantity, today, tz, category_name = item
    local_events = []
    
    try:
        ticker_yahoo = to_yf_ticker(ticker_raw, category_name)
        
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
    user_id = g.user_id
    user_cache = CALENDAR_CACHE.get(user_id, {"data": None, "last_update": 0})
    
    tz = pytz.timezone("America/Sao_Paulo")
    today = datetime.now(tz).date()

    if user_cache["data"] is not None and (now - user_cache["last_update"]) < CACHE_TIMEOUT:
        return jsonify(user_cache["data"])

    # Carrega posições ativas do usuário logado
    items_to_process = []
    with Session() as session:
        try:
            positions = session.query(Position).filter_by(user_id=user_id).join(Asset).filter(Position.quantity > 0).all()
            for pos in positions:
                ticker_raw = pos.asset.ticker.strip().upper()
                if any(x in ticker_raw for x in ["CAIXINHA", "BTC", "ETH"]):
                    continue
                items_to_process.append((ticker_raw, pos.quantity, today, tz, pos.asset.category.name if pos.asset.category else ''))
        except Exception as e:
            logging.error(f"💥 Erro ao ler posições para o calendário: {e}")
            return jsonify({"error": "Erro de banco de dados"}), 500

    if not items_to_process:
        return jsonify([])

    # Função que roda na thread em background
    def run_update():
        global IS_UPDATING_CALENDAR
        with CALENDAR_UPDATE_LOCK:
            IS_UPDATING_CALENDAR = True
            try:
                logging.info("🔍 [BACKGROUND] --- INICIANDO BUSCA ULTRA-RÁPIDA DE PROVENTOS (SESSÃO INJETADA) ---")
                secure_session = get_secure_session()
                try:
                    secure_session.get("https://fc.yahoo.com", timeout=5)
                except Exception:
                    pass

                bg_events = []
                for item in items_to_process:
                    try:
                        res = fetch_single_asset_proventos(item, secure_session)
                        bg_events.extend(res)
                    except Exception as thread_err:
                        logging.warning(f"Erro na busca de provento: {thread_err}")

                bg_events.sort(key=lambda x: x['date'])
                CALENDAR_CACHE[user_id] = {
                    "data": bg_events,
                    "last_update": time.time()
                }
                logging.info(f"🏁 [BACKGROUND] Fim da varredura paralela protegida para user {user_id}. {len(bg_events)} eventos consolidados.")
            except Exception as bg_err:
                logging.error(f"Erro na atualização de proventos em background: {bg_err}")
            finally:
                IS_UPDATING_CALENDAR = False

    # Dispara thread em background se não estiver ativa
    if not IS_UPDATING_CALENDAR:
        threading.Thread(target=run_update, daemon=True).start()

    # Se já temos algum cache (mesmo expirado), retorna ele imediatamente
    if user_cache["data"] is not None:
        return jsonify(user_cache["data"])

    # Se o cache é None (primeiro load pós boot), busca no DB SQLite como fallback rápido
    db_events = []
    with Session() as session:
        try:
            positions = session.query(Position).filter_by(user_id=g.user_id).join(Asset).filter(Position.quantity > 0).all()
            active_ids = [pos.asset_id for pos in positions]
            
            future_divs = session.query(Dividend).filter(
                Dividend.asset_id.in_(active_ids),
                Dividend.date_com >= today
            ).all()
            
            for div in future_divs:
                pos = next((p for p in positions if p.asset_id == div.asset_id), None)
                qty = float(pos.quantity) if pos else 0.0
                db_events.append({
                    "ticker": div.asset.ticker,
                    "date": div.date_com.strftime('%Y-%m-%d'),
                    "total": float(div.value_per_share) * qty,
                    "value_per_share": float(div.value_per_share),
                    "status": "Confirmado" if div.status == "PAGO" else "Anunciado",
                    "is_estimate": False
                })
            db_events.sort(key=lambda x: x['date'])
        except Exception as db_err:
            logging.error(f"Erro ao carregar proventos de fallback do banco: {db_err}")
            
    return jsonify(db_events)
