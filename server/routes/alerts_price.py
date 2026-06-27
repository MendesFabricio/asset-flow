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
import sys
import os
from flask import Blueprint, jsonify, request
from datetime import datetime

sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

from services import Session
from database.models import PriceAlert, MarketData, Asset

price_alerts_bp = Blueprint('price_alerts', __name__)

# ─────────────────────────────────────────────────────────────────────────────
# CRUD
# ─────────────────────────────────────────────────────────────────────────────

@price_alerts_bp.route('/api/price-alerts', methods=['GET'])
def list_price_alerts():
    """Lista todos os alertas ativos (is_active=True)."""
    session = Session()
    try:
        alerts = session.query(PriceAlert).filter_by(is_active=True).order_by(PriceAlert.created_at.desc()).all()
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
    finally:
        Session.remove()


@price_alerts_bp.route('/api/price-alerts', methods=['POST'])
def create_price_alert():
    """
    Cria um novo alerta de preço.
    Body JSON: { "ticker": "PETR4", "target_price": 38.50, "condition": "BELOW", "note": "Stop loss" }
    """
    session = Session()
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
            target_price=target_price,
            condition=condition,
            note=note,
            is_active=True,
            created_at=datetime.now(),
        )
        session.add(alert)
        session.commit()
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
    finally:
        Session.remove()


@price_alerts_bp.route('/api/price-alerts/<int:alert_id>', methods=['DELETE'])
def delete_price_alert(alert_id: int):
    """Remove (hard-delete) um alerta pelo ID."""
    session = Session()
    try:
        alert = session.query(PriceAlert).filter_by(id=alert_id).first()
        if not alert:
            return jsonify({"status": "Erro", "msg": "Alerta não encontrado."}), 404
        session.delete(alert)
        session.commit()
        return jsonify({"status": "Sucesso", "msg": f"Alerta #{alert_id} removido."})
    except Exception as e:
        session.rollback()
        return jsonify({"status": "Erro", "msg": str(e)}), 500
    finally:
        Session.remove()


@price_alerts_bp.route('/api/price-alerts/history', methods=['GET'])
def price_alerts_history():
    """Retorna os últimos 50 alertas disparados (is_active=False)."""
    session = Session()
    try:
        alerts = (
            session.query(PriceAlert)
            .filter_by(is_active=False)
            .order_by(PriceAlert.triggered_at.desc())
            .limit(50)
            .all()
        )
        return jsonify({
            "status": "Sucesso",
            "history": [
                {
                    "id": a.id,
                    "ticker": a.asset.ticker if a.asset else "DESCONHECIDO",
                    "target_price": a.target_price,
                    "condition": a.condition,
                    "note": a.note or "",
                    "triggered_at": a.triggered_at.isoformat() if a.triggered_at else None,
                }
                for a in alerts
            ]
        })
    except Exception as e:
        return jsonify({"status": "Erro", "msg": str(e)}), 500
    finally:
        Session.remove()


# ─────────────────────────────────────────────────────────────────────────────
# JOB DE VERIFICAÇÃO (chamado pelo APScheduler)
# ─────────────────────────────────────────────────────────────────────────────

# Buffer de alertas disparados para notificação ao frontend via polling
_triggered_alerts_buffer: list[dict] = []

def check_price_alerts() -> list[dict]:
    """
    Job de verificação de alertas de preço.
    Roda a cada 5 minutos junto com o job de índices de mercado.

    Compara o preço atual de cada ticker monitorado (via MarketData)
    com o target_price de todos os alertas ativos e dispara os que foram atingidos.

    Returns: lista de alertas disparados nesta execução (para logging/notificação).
    """
    session = Session()
    triggered = []
    try:
        # Carrega apenas alertas ativos realizando join com Asset
        active_alerts = session.query(PriceAlert).join(Asset).filter(PriceAlert.is_active == True).all()
        if not active_alerts:
            return []

        # Pre-fetcha preços atuais de MarketData (evita N+1)
        # Mapa: ticker.upper() → preço atual
        price_map: dict[str, float] = {}
        market_rows = (
            session.query(Asset.ticker, MarketData.price)
            .join(MarketData, MarketData.asset_id == Asset.id)
            .all()
        )
        for ticker, price in market_rows:
            if price:
                price_map[ticker.strip().upper().replace(".SA", "")] = float(price)

        for alert in active_alerts:
            ticker_name = alert.asset.ticker if alert.asset else None
            if not ticker_name:
                continue
            current_price = price_map.get(ticker_name.upper().replace(".SA", ""))
            if current_price is None:
                continue  # Ativo não rastreado ainda — aguarda próximo update

            triggered_now = False
            if alert.condition == "ABOVE" and current_price >= alert.target_price:
                triggered_now = True
            elif alert.condition == "BELOW" and current_price <= alert.target_price:
                triggered_now = True

            if triggered_now:
                alert.is_active = False
                alert.triggered_at = datetime.now()
                triggered_info = {
                    "ticker": ticker_name,
                    "condition": alert.condition,
                    "target_price": alert.target_price,
                    "current_price": current_price,
                    "note": alert.note or "",
                    "triggered_at": alert.triggered_at.isoformat(),
                }
                triggered.append(triggered_info)
                _triggered_alerts_buffer.append(triggered_info)
                logging.info(
                    f"🔔 ALERTA DISPARADO: {ticker_name} {alert.condition} "
                    f"R$ {alert.target_price:.2f} (atual: R$ {current_price:.2f}) — {alert.note}"
                )

        if triggered:
            session.commit()
            logging.info(f"✅ {len(triggered)} alerta(s) de preço disparado(s).")

        return triggered

    except Exception as e:
        session.rollback()
        logging.error(f"❌ Erro no job de price-alerts: {e}", exc_info=True)
        return []
    finally:
        Session.remove()


@price_alerts_bp.route('/api/price-alerts/notifications', methods=['GET'])
def get_alert_notifications():
    """
    Consome e limpa os alertas disparados recentemente (para polling do frontend).
    Retorna e limpa o buffer em memória de disparos recentes.
    """
    global _triggered_alerts_buffer
    notifications = list(_triggered_alerts_buffer)
    _triggered_alerts_buffer.clear()
    return jsonify({"status": "Sucesso", "notifications": notifications})
