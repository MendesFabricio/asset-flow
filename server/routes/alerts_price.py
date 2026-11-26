"""
routes/alerts_price.py — CRUD + job de verificação de PriceAlerts.

Endpoints:
  GET    /api/price-alerts          Lista todos os alertas ativos
  POST   /api/price-alerts          Cria novo alerta
  DELETE /api/price-alerts/<id>     Remove alerta
  GET    /api/price-alerts/history  Histórico de alertas disparados

Job (chamado pelo APScheduler a cada 5 minutos):
  check_price_alerts()              Verifica se algum alerta foi atingido
"""
import logging
import re
from flask import Blueprint, jsonify, request
from datetime import datetime
from db.session import Session
from db.models import PriceAlert, MarketData, Asset, TriggeredAlert, safe_commit
from sqlalchemy import or_
from sqlalchemy.orm import joinedload
from utils.db_utils import with_safe_commit
from utils.notifier import format_alert_telegram, send_telegram_message

price_alerts_bp = Blueprint('price_alerts', __name__)

# ─────────────────────────────────────────────────────────────────────────────
# CRUD
# ─────────────────────────────────────────────────────────────────────────────

@price_alerts_bp.route('/api/price-alerts', methods=['GET'])
def list_price_alerts():
    """Lista todos os alertas ativos (is_active=True)."""
    from flask import g
    with Session() as session:
        try:
            alerts = (
                session.query(PriceAlert)
                .options(joinedload(PriceAlert.asset))
                .filter_by(user_id=g.user_id, is_active=True)
                .order_by(PriceAlert.created_at.desc())
                .all()
            )
            return jsonify({
                "status": "Sucesso",
                "alerts": [
                    {
                        "id": a.id,
                        "ticker": a.asset.ticker if a.asset else "DESCONHECIDO",
                        "target_price": a.target_price,
                        "condition": a.condition,
                        "note": a.note or "",
                        "created_at": a.created_at.isoformat() if a.created_at else None,
                    }
                    for a in alerts
                ]
            })
        except Exception as e:
            logging.error(f"❌ Erro ao listar price-alerts: {e}", exc_info=True)
            return jsonify({"status": "Erro", "msg": str(e)}), 500


@price_alerts_bp.route('/api/price-alerts', methods=['POST'])
@with_safe_commit
def create_price_alert():
    """
    Cria um novo alerta de preço.
    Body JSON: { "ticker": "PETR4", "target_price": 38.50, "condition": "BELOW", "note": "Stop loss" }
    """
    from flask import g
    with Session() as session:
        try:
            body = request.get_json(silent=True) or {}
            ticker = str(body.get("ticker", "")).strip().upper()
            target_price = float(body.get("target_price", 0))
            condition = str(body.get("condition", "ABOVE")).upper()
            note = str(body.get("note", ""))

            if not ticker:
                return jsonify({"status": "Erro", "msg": "Ticker é obrigatório."}), 400
            if target_price <= 0:
                return jsonify({"status": "Erro", "msg": "Preço alvo deve ser maior que zero."}), 400
            if condition not in ("ABOVE", "BELOW"):
                return jsonify({"status": "Erro", "msg": "Condition deve ser ABOVE ou BELOW."}), 400

            # Resolve o asset pelo ticker para manter 3FN no banco
            asset = session.query(Asset).filter_by(ticker=ticker).first()
            if not asset:
                return jsonify({"status": "Erro", "msg": f"Ativo {ticker} não cadastrado na carteira."}), 400

            alert = PriceAlert(
                asset_id=asset.id,
                user_id=g.user_id,
                target_price=target_price,
                condition=condition,
                note=note,
                is_active=True,
                created_at=datetime.now(),
            )
            session.add(alert)
            safe_commit(session)
            logging.info(f"🔔 Alerta criado: {ticker} {condition} R$ {target_price:.2f}")

            return jsonify({
                "status": "Sucesso",
                "msg": f"Alerta criado para {ticker} {condition} R$ {target_price:.2f}",
                "id": alert.id,
            }), 201

        except Exception as e:
            session.rollback()
            logging.error(f"❌ Erro ao criar price-alert: {e}", exc_info=True)
            return jsonify({"status": "Erro", "msg": str(e)}), 500


@price_alerts_bp.route('/api/price-alerts/<int:alert_id>', methods=['DELETE'])
@with_safe_commit
def delete_price_alert(alert_id: int):
    """Remove (hard-delete) um alerta pelo ID."""
    from flask import g
    with Session() as session:
        try:
            alert = session.query(PriceAlert).filter_by(id=alert_id, user_id=g.user_id).first()
            if not alert:
                return jsonify({"status": "Erro", "msg": "Alerta não encontrado."}), 404
            session.delete(alert)
            safe_commit(session)
            return jsonify({"status": "Sucesso", "msg": f"Alerta #{alert_id} removido."})
        except Exception as e:
            session.rollback()
            return jsonify({"status": "Erro", "msg": str(e)}), 500


@price_alerts_bp.route('/api/price-alerts/history', methods=['GET'])
def price_alerts_history():
    """Retorna os últimos 50 alertas disparados (PriceAlert + TriggeredAlert)."""
    from flask import g
    with Session() as session:
        try:
            alerts = (
                session.query(PriceAlert)
                .options(joinedload(PriceAlert.asset))
                .filter_by(user_id=g.user_id, is_active=False)
                .order_by(PriceAlert.triggered_at.desc())
                .limit(50)
                .all()
            )
            triggered_rows = (
                session.query(TriggeredAlert)
                .filter(or_(TriggeredAlert.user_id == g.user_id, TriggeredAlert.user_id.is_(None)))
                .order_by(TriggeredAlert.triggered_at.desc(), TriggeredAlert.id.desc())
                .limit(50)
                .all()
            )
            return jsonify({
                "status": "Sucesso",
                "history": [
                    {
                        "id": a.id,
                        "ticker": a.asset.ticker if a.asset else "DESCONHECIDO",
                        "target_price": float(a.target_price or 0),
                        "condition": a.condition,
                        "note": a.note or "",
                        "triggered_at": a.triggered_at.isoformat() if a.triggered_at else None,
                    }
                    for a in alerts
                ],
                "events": [_serialize_triggered_alert(row) for row in triggered_rows],
            })
        except Exception as e:
            return jsonify({"status": "Erro", "msg": str(e)}), 500


def _infer_event_type(row: TriggeredAlert) -> str:
    if row.event_type:
        return row.event_type
    if row.condition == "SIGNAL_CHANGE":
        return "SIGNAL_CHANGE"
    if row.condition == "DIVIDEND_ANNOUNCED":
        return "DIVIDEND_ANNOUNCED"
    if row.condition in ("EMISSION_ANNOUNCED", "CORP_EVENT_ANNOUNCED"):
        return "CORPORATE_EVENT"
    return "PRICE_ALERT"


def _resolve_triggered_link(row: TriggeredAlert) -> str | None:
    if _infer_event_type(row) != "CORPORATE_EVENT":
        return None
    m = re.search(r"·\s*ID\s+(\S+)", row.note or "")
    if m:
        doc_id = m.group(1).strip()
        if doc_id.isdigit():
            return f"https://fnet.bmfbovespa.com.br/fnet/publico/exibirDocumento?id={doc_id}"
    return None


def _serialize_triggered_alert(row: TriggeredAlert) -> dict:
    return {
        "id": row.id,
        "asset_id": row.asset_id,
        "event_type": _infer_event_type(row),
        "ticker": row.ticker,
        "condition": row.condition,
        "target_price": float(row.target_price or 0),
        "current_price": float(row.current_price or 0),
        "note": row.note or "",
        "link": _resolve_triggered_link(row),
        "is_notified": bool(row.is_notified),
        "triggered_at": row.triggered_at.isoformat() if row.triggered_at else None,
    }


# ─────────────────────────────────────────────────────────────────────────────
# JOB DE VERIFICAÇÃO (chamado pelo APScheduler)
# ─────────────────────────────────────────────────────────────────────────────

def check_price_alerts() -> list[dict]:
    """
    Job de verificação de alertas de preço.
    Compara o preço mais recente de MarketData com todos os PriceAlerts ativos.
    """
    with Session() as session:
        triggered = []
        try:
            active_alerts = session.query(PriceAlert).join(Asset).filter(PriceAlert.is_active == True).all()
            if not active_alerts:
                return []

            # Pre-fetch ordenado do mais recente para garantir que não pega MarketData antigo
            price_map: dict[str, float] = {}
            market_rows = (
                session.query(Asset.ticker, MarketData.price)
                .join(MarketData, MarketData.asset_id == Asset.id)
                .order_by(MarketData.date.desc(), MarketData.id.desc())
                .all()
            )
            for ticker, price in market_rows:
                norm = ticker.strip().upper().replace(".SA", "")
                if price and norm not in price_map:
                    price_map[norm] = float(price)

            telegram_lines: list[str] = []
            for alert in active_alerts:
                ticker_name = alert.asset.ticker if alert.asset else None
                if not ticker_name:
                    continue
                current_price = price_map.get(ticker_name.upper().replace(".SA", ""))
                if current_price is None:
                    continue

                target_val = float(alert.target_price or 0)
                triggered_now = (
                    (alert.condition == "ABOVE" and current_price >= target_val)
                    or (alert.condition == "BELOW" and current_price <= target_val)
                )

                if triggered_now:
                    alert.is_active = False
                    alert.triggered_at = datetime.now()
                    triggered_info = {
                        "ticker": ticker_name,
                        "condition": alert.condition,
                        "target_price": target_val,
                        "current_price": current_price,
                        "note": alert.note or "",
                        "triggered_at": alert.triggered_at.isoformat(),
                    }
                    triggered.append(triggered_info)

                    db_alert = TriggeredAlert(
                        user_id=alert.user_id,
                        asset_id=alert.asset_id,
                        event_type="PRICE_ALERT",
                        ticker=ticker_name,
                        condition=alert.condition,
                        target_price=alert.target_price,
                        current_price=current_price,
                        note=alert.note or "",
                        triggered_at=alert.triggered_at,
                        is_notified=False,
                    )
                    session.add(db_alert)

                    cond_txt = "subiu acima de" if alert.condition == "ABOVE" else "caiu abaixo de"
                    note_suffix = f" ({alert.note})" if alert.note else ""
                    telegram_lines.append(
                        f"• {ticker_name} {cond_txt} R$ {target_val:.2f} → atual R$ {current_price:.2f}{note_suffix}"
                    )
                    logging.info(
                        f"🔔 ALERTA DISPARADO: {ticker_name} {alert.condition} "
                        f"R$ {target_val:.2f} (atual: R$ {current_price:.2f}) — {alert.note}"
                    )

            if triggered:
                safe_commit(session)
                logging.info(f"✅ {len(triggered)} alerta(s) de preço disparado(s).")
                send_telegram_message(
                    format_alert_telegram("🔔 Alerta de Preço — AssetFlow", telegram_lines)
                )

            return triggered

        except Exception as e:
            session.rollback()
            logging.error(f"❌ Erro no job de price-alerts: {e}", exc_info=True)
            return []


@price_alerts_bp.route('/api/price-alerts/notifications', methods=['GET'])
def get_alert_notifications():
    """
    Lista alertas disparados ainda não lidos pelo usuário (leitura não destrutiva).
    Use POST /api/price-alerts/notifications/read ou POST /api/alerts/dismiss para marcar como lido.
    """
    from flask import g
    with Session() as session:
        try:
            db_alerts = (
                session.query(TriggeredAlert)
                .filter(
                    TriggeredAlert.is_notified == False,
                    or_(TriggeredAlert.user_id == g.user_id, TriggeredAlert.user_id.is_(None)),
                )
                .order_by(TriggeredAlert.triggered_at.desc(), TriggeredAlert.id.desc())
                .all()
            )
            return jsonify({
                "status": "Sucesso",
                "notifications": [_serialize_triggered_alert(a) for a in db_alerts],
            })
        except Exception as e:
            logging.error(f"❌ Erro ao buscar notificações de alertas: {e}", exc_info=True)
            return jsonify({"status": "Erro", "msg": str(e)}), 500
