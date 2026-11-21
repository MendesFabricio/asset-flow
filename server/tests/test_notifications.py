from datetime import date, datetime, timedelta
from decimal import Decimal
from unittest.mock import patch
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from db.models import (
    Asset,
    Base,
    Category,
    Dividend,
    MarketData,
    Position,
    PriceAlert,
    TriggeredAlert,
    User,
)
from routes.alerts_price import check_price_alerts


def _setup_memory_db(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)

    class _CtxSession:
        def __init__(self):
            self._s = SessionLocal()

        def __enter__(self):
            return self._s

        def __exit__(self, exc_type, exc, tb):
            self._s.close()

    monkeypatch.setattr("routes.alerts.Session", _CtxSession)
    monkeypatch.setattr("routes.alerts_price.Session", _CtxSession)
    monkeypatch.setattr("routes.auth.verify_session_token", lambda _: {"user_id": 1, "username": "Fabricio"})
    return SessionLocal


def test_non_destructive_notifications_dismiss_datacom_and_latest_price(monkeypatch):
    from backend import app

    SessionLocal = _setup_memory_db(monkeypatch)
    today = date.today()

    with SessionLocal() as seed:
        user = User(id=1, username="Fabricio", password_hash="x")
        cat_acao = Category(id=1, name="Ação")
        cat_fii = Category(id=2, name="FII")
        petr = Asset(id=10, ticker="PETR4", cvm_code="009512", cnpj="33000167000101", category_id=1, currency="BRL")
        rza = Asset(id=11, ticker="RZAG11", cnpj="00000000000191", category_id=2, currency="BRL")
        seed.add_all([user, cat_acao, cat_fii, petr, rza])
        seed.flush()

        seed.add_all([
            Position(user_id=1, asset_id=10, quantity=10, average_price=30.0, manual_dy=0.10, last_report_type="ITR"),
            Position(user_id=1, asset_id=11, quantity=100, average_price=9.5, manual_dy=0.19, last_report_type="FII"),
            # Duas cotações: antiga (35.0) e mais recente (41.0) -> check_price_alerts deve usar 41.0
            MarketData(asset_id=10, date=datetime.now() - timedelta(days=2), price=Decimal("35.00")),
            MarketData(asset_id=10, date=datetime.now(), price=Decimal("41.00")),
            MarketData(asset_id=11, date=datetime.now(), price=Decimal("8.50")),
            PriceAlert(asset_id=10, user_id=1, target_price=Decimal("40.00"), condition="ABOVE", note="Alvo PETR4", is_active=True),
            # Data-Com amanhã diretamente do SQLite (sem depender de CALENDAR_CACHE)
            Dividend(
                asset_id=10, user_id=1, date_com=today + timedelta(days=1), date_payment=today + timedelta(days=15),
                type="Dividendo", value_per_share=0.50, quantity_at_date=10, total_value=5.00, status="A RECEBER",
            ),
            # SIGNAL_CHANGE disparado
            TriggeredAlert(
                user_id=1, asset_id=10, event_type="SIGNAL_CHANGE", ticker="PETR4",
                condition="SIGNAL_CHANGE", target_price=41.0, current_price=41.0,
                note="Mudança de sinal: NEUTRO → COMPRA_FORTE", is_notified=False,
            ),
        ])
        seed.commit()

    with patch("routes.alerts_price.send_telegram_message", return_value=True) as mock_tg:
        fired = check_price_alerts()
        assert len(fired) == 1
        assert fired[0]["current_price"] == pytest.approx(41.0, abs=0.01)
        assert mock_tg.called

    app.config["TESTING"] = True
    with app.test_client() as client:
        client.set_cookie("assetflow_session", "t")

        # 1. Leituras repetidas de /api/price-alerts/notifications NÃO devem apagar alertas
        r1 = client.get("/api/price-alerts/notifications").get_json()
        r2 = client.get("/api/price-alerts/notifications").get_json()
        assert len(r1["notifications"]) == 2
        assert len(r2["notifications"]) == 2
        assert {n["event_type"] for n in r1["notifications"]} == {"PRICE_ALERT", "SIGNAL_CHANGE"}

        # 2. /api/alerts traz Data-Com direto do SQLite e NÃO marca RZAG11 (FII DY 19% < 22%) como trap
        alerts_res = client.get("/api/alerts").get_json()
        assert any(a["type"] == "PROVENTO" and a["ticker"] == "PETR4" for a in alerts_res["items"])
        assert not any(a["ticker"] == "RZAG11" and a["type"] == "RISCO" for a in alerts_res["items"])

        # 3. Dispensar um alerta computado + um TriggeredAlert persiste no banco
        datacom_id = next(a["id"] for a in alerts_res["items"] if a["type"] == "PROVENTO")
        trig_id = r1["notifications"][0]["id"]
        d_res = client.post("/api/alerts/dismiss", json={"ids": [datacom_id, f"triggered-{trig_id}"]})
        assert d_res.status_code == 200

        alerts_after = client.get("/api/alerts").get_json()
        assert alerts_after["dismissed_count"] == 1
        assert not any(a["id"] == datacom_id for a in alerts_after["items"])

        r3 = client.get("/api/price-alerts/notifications").get_json()
        assert len(r3["notifications"]) == 1

        # 4. Marcar todas como lidas limpa restantes e /history retorna os eventos
        assert client.post("/api/alerts/dismiss", json={"all": True}).status_code == 200
        assert len(client.get("/api/price-alerts/notifications").get_json()["notifications"]) == 0
        hist = client.get("/api/price-alerts/history").get_json()
        assert len(hist["events"]) == 2
