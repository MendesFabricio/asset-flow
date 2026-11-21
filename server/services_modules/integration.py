# server/services_modules/integration.py
import logging
import yfinance as yf
from datetime import date, datetime, timedelta
from sqlalchemy import func
from db.models import AssetTransaction, Dividend, Position, safe_commit
from db.session import Session
from utils.ticker_helper import to_yf_ticker
import infrastructure.market_data as _market


def _parse_br_date(raw) -> date | None:
    if not raw or not isinstance(raw, str):
        return None
    cleaned = raw.strip()
    if cleaned in ("-", "--"):
        return None
    try:
        return datetime.strptime(cleaned[:10], "%d/%m/%Y").date()
    except ValueError:
        return None


def _normalize_div_type(raw_type: str | None) -> str:
    low = (raw_type or "").lower()
    if "juros" in low or "jcp" in low:
        return "Juros Sobre Capital Próprio"
    if "rendimento" in low:
        return "Rendimento"
    return "Dividendo"


def _fetch_statusinvest_dividends(ticker_raw: str, category_name: str, secure_session) -> list[dict]:
    if category_name in ("Cripto", "Internacional", "Renda Fixa"):
        paths = ("etf", "fii", "acao")
    elif category_name == "FII":
        paths = ("fii", "etf", "acao")
    else:
        paths = ("acao", "etf", "fii")

    for segment in paths:
        url = (
            f"https://statusinvest.com.br/{segment}/companytickerprovents"
            f"?ticker={ticker_raw}&chartProventsType=0"
        )
        try:
            resp = secure_session.get(url)
            if getattr(resp, "status_code", 0) != 200:
                continue
            payload = resp.json()
            if not isinstance(payload, dict):
                continue
            models = payload.get("assetEarningsModels") or []
            if not models:
                continue
            events = []
            for m in models:
                d_com = _parse_br_date(m.get("ed"))
                val = float(m.get("v") or 0)
                if d_com is None or val <= 0:
                    continue
                d_pay = _parse_br_date(m.get("pd")) or (d_com + timedelta(days=15))
                events.append({
                    "date_com": d_com,
                    "date_payment": d_pay,
                    "value": val,
                    "type": _normalize_div_type(m.get("et") or m.get("etd")),
                })
            if events:
                return events
        except Exception as exc:
            logging.debug(f"StatusInvest proventos ({ticker_raw}/{segment}): {exc}")
    return []


class IntegrationService:
    def update_prices(self, user_id=None):
        uid = user_id if user_id is not None else self.current_user_id
        with Session() as session:
            _market.update_prices(session, self._invalidate_price_cache, user_id=uid)

    def record_confirmed_dividends(self, user_id=None):
        logging.info("📅 [SERVICE] Iniciando verificação automática de novos dividendos...")
        uid = user_id if user_id is not None else getattr(self, "current_user_id", None)
        positions_info = []
        first_tx_map: dict[tuple[int, str], date] = {}
        with Session() as session:
            query = session.query(Position).filter(Position.quantity > 0)
            if uid is not None:
                query = query.filter(Position.user_id == uid)
            positions = query.all()
            for pos in positions:
                if not pos.asset:
                    continue
                positions_info.append({
                    "asset_id": pos.asset_id,
                    "user_id": pos.user_id,
                    "ticker": pos.asset.ticker,
                    "category_name": pos.asset.category.name if pos.asset.category else '',
                    "quantity": float(pos.quantity),
                })

            tx_q = session.query(
                AssetTransaction.user_id,
                AssetTransaction.ticker,
                func.min(AssetTransaction.transaction_date),
            )
            if uid is not None:
                tx_q = tx_q.filter(AssetTransaction.user_id == uid)
            for tx_uid, tx_tkr, min_dt in tx_q.group_by(AssetTransaction.user_id, AssetTransaction.ticker).all():
                if not tx_tkr or not min_dt:
                    continue
                if isinstance(min_dt, datetime):
                    d_min = min_dt.date()
                elif isinstance(min_dt, date):
                    d_min = min_dt
                else:
                    try:
                        d_min = datetime.strptime(str(min_dt)[:10], "%Y-%m-%d").date()
                    except ValueError:
                        continue
                first_tx_map[(tx_uid, tx_tkr.strip().upper())] = d_min

        from utils.http_client import get_secure_session
        secure_session = get_secure_session(timeout=10.0)
        today = datetime.now().date()
        base_cutoff = max(date(2026, 1, 1), today - timedelta(days=365))

        with Session() as session:
            # Normaliza status/date_payment vencidos de proventos existentes
            norm_q = session.query(Dividend)
            if uid is not None:
                norm_q = norm_q.filter(Dividend.user_id == uid)
            changed_norm = False
            for existing_div in norm_q.all():
                if existing_div.date_payment is None and existing_div.date_com is not None:
                    existing_div.date_payment = existing_div.date_com + timedelta(days=15)
                    changed_norm = True
                eff_date = existing_div.date_payment or existing_div.date_com
                if existing_div.status != "PAGO" and eff_date is not None and eff_date <= today:
                    existing_div.status = "PAGO"
                    changed_norm = True
            if changed_norm:
                safe_commit(session)

            for pos_item in positions_info:
                ticker_raw = pos_item["ticker"].strip().upper()
                asset_id = pos_item["asset_id"]
                pos_uid = pos_item["user_id"]
                qty = pos_item["quantity"]
                category_name = pos_item["category_name"]

                if (
                    category_name in ("Reserva", "Renda Fixa")
                    or len(ticker_raw) > 7
                    or " " in ticker_raw
                    or ticker_raw in {"BTC", "ETH", "BITCOIN", "ETHEREUM"}
                ):
                    continue

                cutoff = base_cutoff
                first_tx_date = first_tx_map.get((pos_uid, ticker_raw))
                if first_tx_date is not None and first_tx_date > cutoff:
                    cutoff = first_tx_date

                ticker_yahoo = to_yf_ticker(ticker_raw, category_name)
                try:
                    stock = yf.Ticker(ticker_yahoo, session=secure_session)
                    divs = stock.dividends
                    events: list[dict] = []
                    if divs is not None and not divs.empty:
                        recent_divs = divs[divs.index.date >= cutoff]
                        for date_com_dt, value in recent_divs.items():
                            d_com = date_com_dt.date()
                            val = float(value)
                            if val <= 0:
                                continue
                            events.append({
                                "date_com": d_com,
                                "date_payment": d_com + timedelta(days=15),
                                "value": val,
                                "type": "Dividendo",
                            })
                    else:
                        si_events = _fetch_statusinvest_dividends(ticker_raw, category_name, secure_session)
                        events = [ev for ev in si_events if ev["date_com"] >= cutoff]

                    if not events:
                        continue

                    existing_rows = (
                        session.query(Dividend)
                        .filter(
                            Dividend.asset_id == asset_id,
                            Dividend.user_id == pos_uid,
                            Dividend.date_com >= cutoff - timedelta(days=10),
                        )
                        .all()
                    )

                    added_any = False
                    for ev in events:
                        d_com = ev["date_com"]
                        d_pay = ev["date_payment"]
                        val = ev["value"]
                        ev_type = ev["type"]
                        total = round(val * qty, 4)

                        already_exists = any(
                            (
                                ex.date_com is not None
                                and abs((ex.date_com - d_com).days) <= 4
                                and abs(float(ex.value_per_share or 0) - val) < 0.02
                            )
                            or (
                                ex.date_payment == d_pay
                                and ex.type == ev_type
                                and round(float(ex.total_value or 0), 4) == total
                            )
                            for ex in existing_rows
                        )
                        if already_exists:
                            continue

                        new_div = Dividend(
                            asset_id=asset_id,
                            user_id=pos_uid,
                            date_com=d_com,
                            date_payment=d_pay,
                            type=ev_type,
                            value_per_share=val,
                            quantity_at_date=qty,
                            total_value=total,
                            status="PAGO" if d_pay <= today else "A RECEBER",
                        )
                        session.add(new_div)
                        existing_rows.append(new_div)
                        added_any = True
                        logging.info(f"🆕 Novo provento registrado para {ticker_raw}: R$ {val:.4f} em {d_com}")

                    if added_any:
                        safe_commit(session)
                except Exception as ex:
                    session.rollback()
                    logging.warning(f"Erro ao verificar dividendos de {ticker_raw}: {ex}")
        return True

    def validate_ticker_on_yahoo(self, ticker):
        return _market.validate_ticker_on_yahoo(ticker)

    def sync_reports_with_fnet(self, session=None, state_dict=None, user_id=None):
        """💡 CORREÇÃO CRÍTICA: Permite receber uma sessão explícita da thread injetada pelo backend."""
        uid = user_id if user_id is not None else self.current_user_id
        if session is not None:
            return _market.sync_reports_with_fnet(session, state_dict, user_id=uid)

        with Session() as session:
            return _market.sync_reports_with_fnet(session, state_dict, user_id=uid)

    def update_fundamentals(self, state_dict=None, user_id=None):
        uid = user_id if user_id is not None else self.current_user_id
        return _market.update_fundamentals(self.get_usd_rate, state_dict, user_id=uid)
