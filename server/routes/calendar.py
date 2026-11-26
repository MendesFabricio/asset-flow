from concurrent.futures import ThreadPoolExecutor, as_completed
from flask import Blueprint, jsonify, g
from sqlalchemy.orm import joinedload
from db.models import Asset, AssetTransaction, Position, Session, Dividend
from domain.portfolio.ledger_replay import compute_qty_at_date
from services_modules.integration import _fetch_statusinvest_dividends, _compute_net_dividend_total
from utils.ticker_helper import to_yf_ticker
import yfinance as yf
from datetime import datetime, timedelta
import pytz
import logging
import time
import threading
from utils.http_client import get_secure_session

calendar_bp = Blueprint('calendar', __name__)

CALENDAR_CACHE = {}  # Cache por user_id: {user_id: {"data": [...], "last_update": time.time()}}
CACHE_TIMEOUT = 600  # 10 minutos
CALENDAR_UPDATE_LOCK = threading.Lock()
IS_UPDATING_CALENDAR = False
_UPDATING_USERS: set[int] = set()


def fetch_single_asset_proventos(item, secure_session):
    """Busca anúncios reais confirmados (StatusInvest + Yahoo) respeitando quantidade histórica na Data-Com."""
    if len(item) >= 6:
        ticker_raw, quantity, today, tz, category_name, txs_snap = item
    else:
        ticker_raw, quantity, today, tz, category_name = item
        txs_snap = None
    local_events = []

    try:
        si_events = _fetch_statusinvest_dividends(ticker_raw, category_name, secure_session)
        candidates = [
            ev for ev in si_events
            if (ev.get("date_payment") is None and ev["date_com"] >= today - timedelta(days=60))
            or (ev.get("date_payment") is not None and ev["date_payment"] >= today)
            or ev["date_com"] >= today
        ]

        if not si_events:
            ticker_yahoo = to_yf_ticker(ticker_raw, category_name)
            stock = yf.Ticker(ticker_yahoo, session=secure_session)
            divs = stock.dividends
            if divs is not None and not divs.empty:
                if divs.index.tz is None:
                    divs.index = divs.index.tz_localize(tz)
                else:
                    divs.index = divs.index.tz_convert(tz)
                for date_com_dt, value in divs[divs.index.date >= today].items():
                    d_com = date_com_dt.date()
                    val = float(value)
                    if val > 0:
                        candidates.append({
                            "date_com": d_com,
                            "date_payment": None,
                            "value": val,
                            "raw_type": "Dividendo",
                        })

        fallback_qty = float(quantity)
        for ev in candidates:
            d_com = ev["date_com"]
            d_pay = ev.get("date_payment")
            eff_date = d_pay or d_com
            val = float(ev["value"])
            if txs_snap is not None and d_com <= today:
                qty_f = compute_qty_at_date(txs_snap, d_com, fallback_qty=fallback_qty)
            else:
                qty_f = fallback_qty
            if qty_f <= 0:
                continue
            ev_type, net_total = _compute_net_dividend_total(
                ev.get("raw_type"), category_name, ticker_raw, val, qty_f
            )
            local_events.append({
                "ticker": ticker_raw,
                "date": eff_date.strftime('%Y-%m-%d'),
                "date_com": d_com.strftime('%Y-%m-%d'),
                "date_payment": d_pay.strftime('%Y-%m-%d') if d_pay else None,
                "type": ev_type,
                "quantity": qty_f,
                "total": net_total,
                "value_per_share": round(val, 4),
                "status": "PAGO" if (d_pay is not None and d_pay <= today) else ("PROVISIONADO" if d_pay is None else "A RECEBER"),
                "is_estimate": d_pay is None,
            })
    except Exception as e:
        logging.warning(f"   ⚠️ Falha controlada ao buscar {ticker_raw} em paralelo: {e}")

    return local_events


def _serialize_db_dividend_event(div: Dividend, qty_by_asset: dict, today) -> dict:
    eff_date = div.date_payment or div.date_com
    date_str = eff_date.strftime('%Y-%m-%d') if eff_date else None
    date_pay_str = div.date_payment.strftime('%Y-%m-%d') if div.date_payment else None
    date_com_str = div.date_com.strftime('%Y-%m-%d') if div.date_com else date_pay_str
    qty_val = float(div.quantity_at_date or qty_by_asset.get(div.asset_id, 0.0) or 0.0)
    is_est = div.date_payment is None
    status = div.status or (
        "PROVISIONADO" if is_est else ("PAGO" if div.date_payment <= today else "A RECEBER")
    )
    return {
        "ticker": div.asset.ticker if div.asset else "UNKNOWN",
        "date": date_str,
        "date_com": date_com_str,
        "date_payment": date_pay_str,
        "type": div.type or "Dividendo",
        "quantity": qty_val,
        "total": round(float(div.total_value or 0.0), 2),
        "value_per_share": float(div.value_per_share or 0.0),
        "status": status,
        "is_estimate": is_est,
    }


def _merge_calendar_events(db_events: list[dict], bg_events: list[dict]) -> list[dict]:
    merged = list(db_events)
    seen = {
        (e["ticker"], e.get("date_payment") or e["date"], round(float(e.get("total") or 0), 2))
        for e in db_events
    }
    seen_tkr_pay_com = {
        (e["ticker"], e.get("date_payment") or e["date"], e.get("date_com") or e["date"], e.get("type") or "Dividendo")
        for e in db_events
    }
    for ev in bg_events:
        k1 = (ev["ticker"], ev.get("date_payment") or ev["date"], round(float(ev.get("total") or 0), 2))
        k2 = (ev["ticker"], ev.get("date_payment") or ev["date"], ev.get("date_com") or ev["date"], ev.get("type") or "Dividendo")
        if k1 in seen or k2 in seen_tkr_pay_com:
            continue
        seen.add(k1)
        seen_tkr_pay_com.add(k2)
        merged.append(ev)
    merged.sort(key=lambda x: (x.get("date") or "", x.get("ticker") or ""))
    return merged


@calendar_bp.route('/api/calendar', methods=['GET'])
def get_calendar():
    now = time.time()
    user_id = g.user_id
    user_cache = CALENDAR_CACHE.get(user_id, {"data": None, "last_update": 0})

    tz = pytz.timezone("America/Sao_Paulo")
    today = datetime.now(tz).date()
    history_cutoff = today - timedelta(days=365)

    items_to_process = []
    db_events = []
    with Session() as session:
        try:
            positions = (
                session.query(Position)
                .filter_by(user_id=user_id)
                .join(Asset)
                .options(joinedload(Position.asset).joinedload(Asset.category))
                .filter(Position.quantity > 0)
                .all()
            )
            qty_by_asset = {pos.asset_id: float(pos.quantity) for pos in positions}

            txs_by_pos: dict[int, list] = {}
            pos_ids = [getattr(p, "id", None) for p in positions if getattr(p, "id", None) is not None]
            if pos_ids:
                for t in (
                    session.query(AssetTransaction)
                    .filter(AssetTransaction.position_id.in_(pos_ids), AssetTransaction.user_id == user_id)
                    .order_by(AssetTransaction.transaction_date.asc(), AssetTransaction.id.asc())
                    .all()
                ):
                    txs_by_pos.setdefault(t.position_id, []).append((t.type, float(t.quantity or 0), t.transaction_date, t.corporate_event_id, t.id))

            # Convertemos para NamedTuple/SimpleNamespace imutável para a thread em background
            from types import SimpleNamespace
            for pos in positions:
                ticker_raw = pos.asset.ticker.strip().upper()
                cat_name = pos.asset.category.name if pos.asset.category else ''
                if (
                    cat_name in ("Reserva", "Renda Fixa")
                    or len(ticker_raw) > 7
                    or " " in ticker_raw
                    or ticker_raw.endswith("-USD")
                    or ticker_raw in {"BTC", "ETH", "BITCOIN", "ETHEREUM"}
                ):
                    continue
                pid = getattr(pos, "id", None)
                txs_snap = [
                    SimpleNamespace(type=tp, quantity=q, transaction_date=dt, corporate_event_id=cid, id=tid)
                    for tp, q, dt, cid, tid in txs_by_pos.get(pid, [])
                ] if pid is not None else []
                items_to_process.append((ticker_raw, pos.quantity, today, tz, cat_name, txs_snap))

            recent_and_upcoming = (
                session.query(Dividend)
                .options(joinedload(Dividend.asset))
                .filter(
                    Dividend.user_id == user_id,
                    (Dividend.date_payment >= history_cutoff) | (Dividend.date_com >= history_cutoff),
                )
                .all()
            )
            for div in recent_and_upcoming:
                db_events.append(_serialize_db_dividend_event(div, qty_by_asset, today))
        except Exception as e:
            logging.error(f"💥 Erro ao ler posições para o calendário: {e}")
            return jsonify({"error": "Erro de banco de dados"}), 500

    cache_stale = user_cache["data"] is None or (now - user_cache["last_update"]) >= CACHE_TIMEOUT

    with CALENDAR_UPDATE_LOCK:
        is_user_updating = user_id in _UPDATING_USERS
        should_start = cache_stale and bool(items_to_process) and not is_user_updating
        if should_start:
            _UPDATING_USERS.add(user_id)

    if should_start:
        def run_update():
            try:
                logging.info("🔍 [BACKGROUND] --- INICIANDO BUSCA DE PROVENTOS ANUNCIADOS ---")
                secure_session = get_secure_session()
                try:
                    secure_session.get("https://fc.yahoo.com", timeout=5)
                except Exception:
                    pass

                bg_events = []
                with ThreadPoolExecutor(max_workers=4) as pool:
                    futures = [pool.submit(fetch_single_asset_proventos, item, secure_session) for item in items_to_process]
                    for fut in as_completed(futures):
                        try:
                            bg_events.extend(fut.result())
                        except Exception as thread_err:
                            logging.warning(f"Erro na busca de provento: {thread_err}")

                bg_events.sort(key=lambda x: x['date'])
                CALENDAR_CACHE[user_id] = {
                    "data": bg_events,
                    "last_update": time.time()
                }
                logging.info(f"🏁 [BACKGROUND] Fim da varredura de agenda para user {user_id}. {len(bg_events)} eventos futuros consolidados.")
            except Exception as bg_err:
                logging.error(f"Erro na atualização de proventos em background: {bg_err}")
            finally:
                with CALENDAR_UPDATE_LOCK:
                    _UPDATING_USERS.discard(user_id)

        threading.Thread(target=run_update, daemon=True).start()

    bg_cached = user_cache["data"] or []
    return jsonify(_merge_calendar_events(db_events, bg_cached))
