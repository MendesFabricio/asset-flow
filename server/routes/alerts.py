# server/routes/alerts.py
import json
import logging
import re
from datetime import datetime, timedelta
from flask import Blueprint, jsonify, g, request
from sqlalchemy import or_
from db.models import Dividend, SystemCache, TriggeredAlert, get_active_positions, safe_commit
from db.session import Session
from utils.notifier import format_alert_telegram, is_telegram_configured, send_telegram_message

alerts_bp = Blueprint('alerts', __name__)


def _dismiss_cache_key(user_id: int) -> str:
    return f"dismissed_alerts_{user_id}"


def _load_dismissed_ids(session, user_id: int) -> set[str]:
    rec = session.query(SystemCache).filter_by(key=_dismiss_cache_key(user_id)).first()
    if not rec or not rec.value:
        return set()
    try:
        loaded = json.loads(rec.value)
        if isinstance(loaded, list):
            return {str(x) for x in loaded}
    except Exception:
        pass
    return set()


def _save_dismissed_ids(session, user_id: int, ids: set[str]) -> None:
    key = _dismiss_cache_key(user_id)
    payload = json.dumps(sorted(ids))
    rec = session.query(SystemCache).filter_by(key=key).first()
    if not rec:
        session.add(SystemCache(key=key, value=payload, updated_at=datetime.now()))
    else:
        rec.value = payload
        rec.updated_at = datetime.now()


# ⚡ Micro-otimização: make_alert definido no escopo do módulo para evitar re-alocações na execução do loop
def make_alert(asset, field, type_alert, msg, severity, action=None):
    return {
        "id": f"{asset.id}_{field}_{type_alert}",
        "asset_id": asset.id,
        "ticker": asset.ticker,
        "field": field,
        "type": type_alert,
        "message": msg,
        "severity": severity,
        "action": action
    }


def _collect_portfolio_alerts(session, user_id: int) -> list[dict]:
    alerts: list[dict] = []
    positions = get_active_positions(session, user_id).all()
    today = datetime.now()
    today_d = today.date()

    # Pré-carrega proventos próximos do usuário em uma única query (Data-Com <= +3d ou Pagamento <= +1d)
    upcoming_divs = (
        session.query(Dividend)
        .filter(
            Dividend.user_id == user_id,
            or_(
                (Dividend.date_com >= today_d) & (Dividend.date_com <= today_d + timedelta(days=3)),
                (
                    (Dividend.status == "A RECEBER")
                    & (Dividend.date_payment >= today_d)
                    & (Dividend.date_payment <= today_d + timedelta(days=1))
                ),
            ),
        )
        .all()
    )
    divs_by_aid: dict[int, list[Dividend]] = {}
    for d in upcoming_divs:
        divs_by_aid.setdefault(d.asset_id, []).append(d)

    for pos in positions:
        asset = pos.asset
        if not asset:
            continue

        category = asset.category.name if asset.category else "Outros"

        mdata = None
        if asset.market_data and len(asset.market_data) > 0:
            sorted_mdata = sorted(asset.market_data, key=lambda x: x.date, reverse=True)
            mdata = sorted_mdata[0]

        current_price = float(mdata.price) if mdata and mdata.price else 0.0
        change_percent = float(mdata.change_percent) if mdata and mdata.change_percent else 0.0

        if current_price <= 0 and category != "Reserva":
            alerts.append(make_alert(asset, "price", "CRÍTICO", "Preço zerado. Verifique conexão/ticker.", 5, "refresh"))

        if category == 'Ação' and (not asset.cvm_code or asset.cvm_code == ""):
            alerts.append(make_alert(asset, "cvm", "CONFIG", "Falta vincular Código CVM (Sync).", 4, "edit"))

        if category in ['Ação', 'FII'] and (not asset.cnpj or len(str(asset.cnpj)) < 14):
            alerts.append(make_alert(asset, "cnpj", "CONFIG", "Falta cadastrar CNPJ (Sync).", 3, "edit"))

        if category in ['Ação', 'FII'] and not pos.last_report_type:
            alerts.append(make_alert(asset, "report", "CONFIG", "Relatórios não sincronizados.", 3, "sync"))

        # ALERTA DE RELATÓRIO RECENTE / DADOS NOVOS
        if pos.last_report_at:
            try:
                match = re.search(r'(\d{2}/\d{2}/\d{4})', pos.last_report_at)
                if match:
                    report_date_str = match.group(1)
                    report_date = datetime.strptime(report_date_str, '%d/%m/%Y')
                    delta = today - report_date
                    if delta.days <= 15:
                        msg_prefix = "Novo Fato Relevante" if category == 'FII' else "Novo Balanço"
                        alerts.append(make_alert(
                            asset,
                            "report_new",
                            "NOVIDADE",
                            f"📄 {msg_prefix} recente ({report_date_str}). Já analisou?",
                            2,
                            "view"
                        ))
            except Exception as parse_err:
                logging.debug(f"Parse report_date alerta {asset.ticker}: {parse_err}")

        # ALERTAS DE RISCO FINANCEIRO (Prejuízo, Dividend Trap)
        if category == 'Ação' and pos.manual_lpa is not None and float(pos.manual_lpa) < 0:
            alerts.append(make_alert(asset, "lpa", "RISCO", f"Empresa com PREJUÍZO (LPA: {float(pos.manual_lpa):.2f}).", 4, "view"))

        dy_trap_limit = 0.22 if category == 'FII' else 0.18
        if category in ['Ação', 'FII'] and pos.manual_dy is not None and float(pos.manual_dy) > dy_trap_limit:
            dy_pct = float(pos.manual_dy) * 100
            alerts.append(make_alert(asset, "dy", "RISCO", f"Dividend Trap? DY muito alto ({dy_pct:.1f}%).", 4, "view"))

        if category == 'FII' and pos.manual_vpa is not None and float(pos.manual_vpa) > 0 and current_price > 0:
            pvp = current_price / float(pos.manual_vpa)
            if pvp > 1.25:
                alerts.append(make_alert(asset, "pvp", "ALERTA", f"FII caro (P/VP {pvp:.2f}). Risco de correção.", 3, "view"))

        # ALERTAS DE MERCADO (Volatilidade)
        if change_percent < -3.0:
            alerts.append(make_alert(asset, "change", "OPORTUNIDADE", f"Queda forte ({change_percent:.2f}%).", 2, "view"))
        if change_percent > 5.0:
            alerts.append(make_alert(asset, "change", "ALERTA", f"Alta forte ({change_percent:.2f}%).", 2, "view"))

        # ALERTAS DE SPLIT/INPLIT
        if category in ['Ação', 'FII']:
            if asset.upcoming_split:
                try:
                    split_date_str, ratio = asset.upcoming_split.split(":")
                    d_parts = split_date_str.split("-")
                    formatted_date = f"{d_parts[2]}/{d_parts[1]}/{d_parts[0]}"
                    alerts.append(make_alert(asset, "split", "CRÍTICO", f"Desdobramento (Split) confirmado de {ratio}x em {formatted_date}.", 5, "view"))
                except Exception as exc:
                    logging.debug(f"Parse split alerta {asset.ticker}: {exc}")

            if asset.currency == "BRL" and current_price > 0 and current_price < 1.0:
                alerts.append(make_alert(asset, "inplit", "CRÍTICO", f"Penny stock (R$ {current_price:.2f}). Risco de grupamento obrigatório (Inplit) pela B3.", 5, "view"))

        if category in ['Ação', 'FII'] and pos.manual_dy is None:
            alerts.append(make_alert(asset, "dy", "DADOS", "Falta cadastrar DY.", 1, "edit"))

        # ALERTAS DE PROVENTOS (Data-Com próxima e Pagamento iminente diretamente do SQLite)
        for div in divs_by_aid.get(asset.id, []):
            if div.date_com and 0 <= (div.date_com - today_d).days <= 3:
                delta_com = (div.date_com - today_d).days
                when_txt = "hoje" if delta_com == 0 else (f"amanhã ({div.date_com.strftime('%d/%m')})" if delta_com == 1 else f"em {delta_com} dias ({div.date_com.strftime('%d/%m')})")
                alerts.append({
                    "id": f"{asset.id}_datacom_{div.date_com.isoformat()}_{div.id}",
                    "asset_id": asset.id,
                    "ticker": asset.ticker,
                    "field": "datacom",
                    "type": "PROVENTO",
                    "message": f"⏰ Data-Com {when_txt} ({div.type or 'Provento'}): R$ {float(div.value_per_share or 0):.4f}/cota.",
                    "severity": 4 if delta_com == 0 else 3,
                    "action": "agenda",
                })
            if div.status == "A RECEBER" and div.date_payment and 0 <= (div.date_payment - today_d).days <= 1:
                delta_pay = (div.date_payment - today_d).days
                when_pay = "hoje" if delta_pay == 0 else "amanhã"
                alerts.append({
                    "id": f"{asset.id}_pay_{div.date_payment.isoformat()}_{div.id}",
                    "asset_id": asset.id,
                    "ticker": asset.ticker,
                    "field": "payment",
                    "type": "PROVENTO",
                    "message": f"💰 Pagamento {when_pay} ({div.date_payment.strftime('%d/%m')}): R$ {float(div.total_value or 0):.2f} líquido.",
                    "severity": 3,
                    "action": "agenda",
                })

    alerts.sort(key=lambda x: x["severity"], reverse=True)
    return alerts


@alerts_bp.route('/api/alerts', methods=['GET'])
def get_alerts():
    page = request.args.get('page', 1, type=int)
    page_size = request.args.get('page_size', 50, type=int)
    include_dismissed = request.args.get('include_dismissed', 'false').lower() == 'true'

    with Session() as session:
        try:
            all_alerts = _collect_portfolio_alerts(session, g.user_id)
            dismissed_ids = _load_dismissed_ids(session, g.user_id)

            if include_dismissed:
                visible_alerts = all_alerts
                dismissed_count = sum(1 for a in all_alerts if a["id"] in dismissed_ids)
            else:
                visible_alerts = [a for a in all_alerts if a["id"] not in dismissed_ids]
                dismissed_count = len(all_alerts) - len(visible_alerts)

            total = len(visible_alerts)
            start = (page - 1) * page_size
            end = start + page_size
            page_items = visible_alerts[start:end]
            return jsonify({
                "items": page_items,
                "total": total,
                "dismissed_count": dismissed_count,
                "telegram_configured": is_telegram_configured(),
                "page": page,
                "page_size": page_size
            })
        except Exception as e:
            logging.error(f"❌ Erro crítico no pipeline da API de Alertas: {e}")
            return jsonify({"items": [], "total": 0, "dismissed_count": 0, "telegram_configured": False, "page": page, "page_size": page_size})


@alerts_bp.route('/api/alerts/dismiss', methods=['POST'])
def dismiss_alerts():
    """Silencia alertas computados ou marca TriggeredAlerts como lidos, ou restaura silenciados."""
    body = request.get_json(silent=True) or {}
    restore = bool(body.get("restore"))
    dismiss_all = bool(body.get("all"))
    item_id = body.get("id")
    ids = body.get("ids") or ([item_id] if item_id is not None else [])
    triggered_ids = body.get("triggered_ids") or []

    with Session() as session:
        try:
            if restore:
                _save_dismissed_ids(session, g.user_id, set())
                safe_commit(session)
                return jsonify({"status": "Sucesso", "restored": True})

            dismissed_ids = _load_dismissed_ids(session, g.user_id)
            if dismiss_all:
                current_alerts = _collect_portfolio_alerts(session, g.user_id)
                for a in current_alerts:
                    dismissed_ids.add(a["id"])
                session.query(TriggeredAlert).filter(
                    TriggeredAlert.is_notified == False,
                    or_(TriggeredAlert.user_id == g.user_id, TriggeredAlert.user_id.is_(None)),
                ).update({"is_notified": True}, synchronize_session=False)
            else:
                for raw_id in ids:
                    s_id = str(raw_id)
                    if s_id.startswith("triggered-"):
                        try:
                            triggered_ids.append(int(s_id.split("triggered-", 1)[1]))
                        except ValueError:
                            pass
                    else:
                        dismissed_ids.add(s_id)
                if triggered_ids:
                    session.query(TriggeredAlert).filter(
                        TriggeredAlert.id.in_([int(x) for x in triggered_ids]),
                        or_(TriggeredAlert.user_id == g.user_id, TriggeredAlert.user_id.is_(None)),
                    ).update({"is_notified": True}, synchronize_session=False)

            _save_dismissed_ids(session, g.user_id, dismissed_ids)
            safe_commit(session)
            return jsonify({"status": "Sucesso", "dismissed_total": len(dismissed_ids)})
        except Exception as e:
            session.rollback()
            logging.error(f"❌ Erro ao silenciar/marcar alertas: {e}", exc_info=True)
            return jsonify({"status": "Erro", "msg": str(e)}), 500


@alerts_bp.route('/api/alerts/test-telegram', methods=['POST'])
def test_telegram_channel():
    """Envia mensagem de teste para o Telegram configurado no .env."""
    if not is_telegram_configured():
        return jsonify({
            "status": "Erro",
            "msg": "Defina TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID no .env para ativar o Telegram.",
        }), 400

    ok = send_telegram_message(
        format_alert_telegram(
            "✅ AssetFlow — Teste de Notificação",
            ["Canal Telegram conectado! Alertas de preço, sinais e proventos serão enviados aqui."],
        )
    )
    if ok:
        return jsonify({"status": "Sucesso", "msg": "Mensagem de teste enviada ao Telegram!"})
    return jsonify({"status": "Erro", "msg": "Falha ao enviar para a API do Telegram. Verifique token e chat_id."}), 502
