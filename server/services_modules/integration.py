# server/services_modules/integration.py
import logging
import yfinance as yf
from datetime import date, datetime, timedelta
from sqlalchemy import func
from db.models import AssetTransaction, Dividend, Position, TriggeredAlert, safe_commit
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


def _compute_net_dividend_total(
    raw_type: str | None,
    category_name: str,
    ticker_raw: str,
    value_per_share: float,
    qty: float,
) -> tuple[str, float]:
    """Normaliza tipo de provento e aplica IRRF líquido (15% JCP / ETF Cripto, 22,5% Rend. Tributado)."""
    low = (raw_type or "").lower()
    tkr_u = (ticker_raw or "").strip().upper()
    is_taxed_etf = (category_name == "Cripto") or (tkr_u in {"COIN11", "ETHY11"})

    if "juros" in low or "jcp" in low:
        norm_type = "Juros Sobre Capital Próprio"
        tax_factor = 0.85
    elif "tributado" in low:
        norm_type = "Rendimento"
        tax_factor = 0.775
    elif "rendimento" in low:
        norm_type = "Rendimento"
        tax_factor = 0.85 if is_taxed_etf else 1.0
    else:
        norm_type = "Dividendo"
        tax_factor = 0.85 if is_taxed_etf else 1.0

    net_total = round(float(value_per_share) * float(qty) * tax_factor, 2)
    return norm_type, net_total


def _compute_qty_at_date(current_qty: float, txs_asc: list, d_com: date) -> float:
    """Reconstrói a quantidade detida na Data-Com com base nas transações em ordem cronológica."""
    if not txs_asc:
        return float(current_qty)
    parsed = []
    for tx in txs_asc:
        raw_dt = getattr(tx, "transaction_date", None)
        if isinstance(raw_dt, datetime):
            td = raw_dt.date()
        elif isinstance(raw_dt, date):
            td = raw_dt
        elif raw_dt:
            try:
                td = datetime.strptime(str(raw_dt)[:10], "%Y-%m-%d").date()
            except ValueError:
                continue
        else:
            continue
        parsed.append((td, getattr(tx, "id", 0) or 0, getattr(tx, "type", ""), float(getattr(tx, "quantity", 0) or 0)))

    if not parsed:
        return float(current_qty)

    first_dt = min(x[0] for x in parsed)
    if d_com < first_dt:
        return 0.0

    checkpoints = ("BONUS", "SPLIT", "INPLIT", "ADJUSTMENT")
    has_future_cp = any(td > d_com and ttype in checkpoints for td, _, ttype, _ in parsed)
    if not has_future_cp:
        q = float(current_qty)
        for td, _, ttype, tqty in reversed(parsed):
            if td <= d_com:
                break
            if ttype in ("BUY", "TICKER_CHANGE_IN", "SPIN_OFF_RECEIPT"):
                q -= tqty
            elif ttype in ("SELL", "TICKER_CHANGE_OUT"):
                q += tqty
        return round(max(0.0, q), 4)

    q = 0.0
    for td, _, ttype, tqty in parsed:
        if td > d_com:
            break
        if ttype in checkpoints:
            q = tqty
        elif ttype in ("BUY", "TICKER_CHANGE_IN", "SPIN_OFF_RECEIPT"):
            q += tqty
        elif ttype in ("SELL", "TICKER_CHANGE_OUT"):
            q -= tqty
    return round(max(0.0, q), 4)


def _fetch_statusinvest_dividends(ticker_raw: str, category_name: str, secure_session) -> list[dict]:
    tkr_u = (ticker_raw or "").strip().upper()
    if tkr_u[-2:] in ("32", "33", "34", "35", "39"):
        paths = ("bdr", "acao", "etf", "fii")
    elif category_name in ("Cripto", "Internacional", "Renda Fixa"):
        paths = ("etf", "fii", "acao", "bdr")
    elif category_name == "FII":
        paths = ("fii", "etf", "acao", "bdr")
    else:
        paths = ("acao", "fii", "etf", "bdr")

    for segment in paths:
        url = (
            f"https://statusinvest.com.br/{segment}/companytickerprovents"
            f"?ticker={tkr_u}&chartProventsType=0"
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
                raw_type = m.get("et") or m.get("etd") or "Dividendo"
                events.append({
                    "date_com": d_com,
                    "date_payment": d_pay,
                    "value": val,
                    "raw_type": raw_type,
                })
            if events:
                return events
        except Exception as exc:
            logging.debug(f"StatusInvest proventos ({tkr_u}/{segment}): {exc}")
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
        txs_by_user_ticker: dict[tuple[int, str], list] = {}

        with Session() as session:
            query = session.query(Position).filter(Position.quantity > 0)
            if uid is not None:
                query = query.filter(Position.user_id == uid)
            for pos in query.all():
                if not pos.asset:
                    continue
                positions_info.append({
                    "asset_id": pos.asset_id,
                    "user_id": pos.user_id,
                    "ticker": pos.asset.ticker,
                    "category_name": pos.asset.category.name if pos.asset.category else '',
                    "quantity": float(pos.quantity),
                })

            tx_q = session.query(AssetTransaction).order_by(
                AssetTransaction.transaction_date.asc(),
                AssetTransaction.id.asc(),
            )
            if uid is not None:
                tx_q = tx_q.filter(AssetTransaction.user_id == uid)
            for tx in tx_q.all():
                if tx.ticker:
                    txs_by_user_ticker.setdefault((tx.user_id, tx.ticker.strip().upper()), []).append(tx)

        from utils.http_client import get_secure_session
        secure_session = get_secure_session(timeout=10.0)
        today = datetime.now().date()
        cutoff = max(date(2026, 1, 1), today - timedelta(days=365))
        yf_recent_cutoff = today - timedelta(days=75)

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

                user_ticker_txs = txs_by_user_ticker.get((pos_uid, ticker_raw), [])
                ticker_yahoo = to_yf_ticker(ticker_raw, category_name)
                try:
                    si_events = _fetch_statusinvest_dividends(ticker_raw, category_name, secure_session)
                    events = [
                        ev for ev in si_events
                        if ev["date_com"] >= cutoff or ev["date_payment"] >= cutoff
                    ]

                    # Yahoo Finance como fallback ou complemento mensal recente (ex.: ITUB3 JCP)
                    try:
                        stock = yf.Ticker(ticker_yahoo, session=secure_session)
                        divs = stock.dividends
                    except Exception:
                        divs = None

                    if divs is not None and not divs.empty:
                        is_monthly_bank = ticker_raw in ("ITUB3", "BBDC4")
                        if not si_events:
                            for date_com_dt, value in divs[divs.index.date >= cutoff].items():
                                d_com = date_com_dt.date()
                                val = float(value)
                                if val <= 0:
                                    continue
                                raw_tp = "JCP" if (is_monthly_bank and val < 0.025) else "Dividendo"
                                events.append({
                                    "date_com": d_com,
                                    "date_payment": d_com + timedelta(days=15),
                                    "value": val,
                                    "raw_type": raw_tp,
                                })
                        else:
                            for date_com_dt, value in divs[divs.index.date >= yf_recent_cutoff].items():
                                d_com = date_com_dt.date()
                                val = float(value)
                                if val <= 0:
                                    continue
                                has_si_near = any(abs((ev["date_com"] - d_com).days) <= 4 for ev in si_events)
                                has_si_pay_month = is_monthly_bank and any(
                                    (ev["date_payment"].year, ev["date_payment"].month) == (d_com.year, d_com.month)
                                    for ev in si_events
                                )
                                if has_si_near or has_si_pay_month:
                                    continue
                                is_monthly_jcp = is_monthly_bank and val < 0.025
                                events.append({
                                    "date_com": d_com,
                                    "date_payment": d_com if is_monthly_jcp else (d_com + timedelta(days=15)),
                                    "value": val,
                                    "raw_type": "JCP" if is_monthly_jcp else "Dividendo",
                                })

                    if not events:
                        continue

                    existing_rows = (
                        session.query(Dividend)
                        .filter(
                            Dividend.asset_id == asset_id,
                            Dividend.user_id == pos_uid,
                            (Dividend.date_com >= cutoff - timedelta(days=45))
                            | (Dividend.date_payment >= cutoff - timedelta(days=45)),
                        )
                        .all()
                    )

                    consumed_ids: set[int] = set()
                    dirty = False
                    is_etf_taxed = (category_name == "Cripto") or (ticker_raw in {"COIN11", "ETHY11"})

                    def _types_compat(t_ex: str | None, t_ev: str) -> bool:
                        a = t_ex or "Dividendo"
                        if a == t_ev:
                            return True
                        return is_etf_taxed and ({a, t_ev} <= {"Dividendo", "Rendimento"})

                    for ev in events:
                        d_com = ev["date_com"]
                        d_pay = ev["date_payment"]
                        val = float(ev["value"])
                        qty_at = qty if d_com > today else _compute_qty_at_date(qty, user_ticker_txs, d_com)
                        if qty_at <= 0:
                            continue

                        ev_type, net_total = _compute_net_dividend_total(
                            ev.get("raw_type"), category_name, ticker_raw, val, qty_at
                        )
                        tol = max(0.35, 0.08 * max(net_total, 1.0))

                        # 1. Já existe exatamente com mesma (date_com, date_payment, type) ou valor próximo no mesmo pagamento?
                        exact_match = next(
                            (
                                ex for ex in existing_rows
                                if (
                                    ex.date_com == d_com
                                    and ex.date_payment == d_pay
                                    and _types_compat(ex.type, ev_type)
                                    and abs(float(ex.value_per_share or 0) - val) < 0.02
                                )
                                or (
                                    ex.date_com is not None
                                    and abs((ex.date_com - d_com).days) <= 4
                                    and (ex.date_payment is None or abs((ex.date_payment - d_pay).days) <= 4)
                                    and _types_compat(ex.type, ev_type)
                                    and abs(float(ex.total_value or 0) - net_total) <= tol
                                    and ex.date_com != ex.date_payment
                                )
                            ),
                            None,
                        )
                        if exact_match:
                            consumed_ids.add(id(exact_match))
                            continue

                        # 2. Enriquece registro importado da B3 (que tinha date_com == date_payment) com Data-Com real
                        placeholder_candidates = [
                            ex for ex in existing_rows
                            if (id(ex) not in consumed_ids)
                            and ex.date_payment == d_pay
                            and ex.date_com == d_pay
                            and _types_compat(ex.type, ev_type)
                            and abs(float(ex.total_value or 0) - net_total) <= tol
                            and not any(
                                o is not ex
                                and o.date_com == d_com
                                and o.date_payment == d_pay
                                and (o.type or "Dividendo") == (ex.type or "Dividendo")
                                and round(float(o.total_value or 0), 2) == round(float(ex.total_value or 0), 2)
                                for o in existing_rows
                            )
                        ]
                        placeholder = (
                            min(placeholder_candidates, key=lambda ex: abs(float(ex.total_value or 0) - net_total))
                            if placeholder_candidates
                            else None
                        )
                        if placeholder is not None:
                            placeholder.date_com = d_com
                            consumed_ids.add(id(placeholder))
                            dirty = True
                            continue

                        # 3. Protege UniqueConstraint contra colisão exata
                        if any(
                            ex.date_com == d_com
                            and ex.date_payment == d_pay
                            and _types_compat(ex.type, ev_type)
                            and round(float(ex.total_value or 0), 2) == net_total
                            for ex in existing_rows
                        ):
                            continue

                        new_status = "PAGO" if d_pay <= today else "A RECEBER"
                        new_div = Dividend(
                            asset_id=asset_id,
                            user_id=pos_uid,
                            date_com=d_com,
                            date_payment=d_pay,
                            type=ev_type,
                            value_per_share=val,
                            quantity_at_date=qty_at,
                            total_value=net_total,
                            status=new_status,
                        )
                        session.add(new_div)
                        existing_rows.append(new_div)
                        dirty = True
                        if new_status == "A RECEBER":
                            note_txt = (
                                f"Novo provento ({ev_type}): R$ {net_total:.2f} líquido | "
                                f"Com {d_com.strftime('%d/%m/%Y')} · Pgto {d_pay.strftime('%d/%m/%Y')}"
                            )
                            dup_ta = (
                                session.query(TriggeredAlert)
                                .filter_by(
                                    user_id=pos_uid,
                                    ticker=ticker_raw,
                                    condition="DIVIDEND_ANNOUNCED",
                                    note=note_txt,
                                )
                                .first()
                            )
                            if not dup_ta:
                                session.add(
                                    TriggeredAlert(
                                        user_id=pos_uid,
                                        asset_id=asset_id,
                                        event_type="DIVIDEND_ANNOUNCED",
                                        ticker=ticker_raw,
                                        condition="DIVIDEND_ANNOUNCED",
                                        target_price=val,
                                        current_price=net_total,
                                        note=note_txt,
                                        triggered_at=datetime.now(),
                                        is_notified=False,
                                    )
                                )
                                from utils.notifier import format_alert_telegram, send_telegram_message
                                send_telegram_message(
                                    format_alert_telegram(
                                        "💰 Novo Provento Anunciado — AssetFlow",
                                        [f"• {ticker_raw}: {note_txt}"],
                                    )
                                )
                        logging.info(
                            f"🆕 Novo provento registrado para {ticker_raw}: "
                            f"R$ {net_total:.2f} líquido (Data-Com {d_com}, Pgto {d_pay})"
                        )

                    if dirty:
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
