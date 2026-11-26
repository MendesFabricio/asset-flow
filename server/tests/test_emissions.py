from datetime import date, datetime, timedelta
from decimal import Decimal
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from crawlers.b3_fnet import B3FnetCrawler
from db.models import (
    Asset,
    AssetTransaction,
    Base,
    Category,
    CorporateEvent,
    Position,
    TriggeredAlert,
    User,
)
from infrastructure.market_data import _process_corporate_notices


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

    monkeypatch.setattr("db.session.Session", _CtxSession)
    monkeypatch.setattr("db.session.engine", engine)
    monkeypatch.setattr("routes.auth.verify_session_token", lambda _: {"user_id": 1, "username": "Fabricio"})
    return SessionLocal


def test_classify_corporate_notice():
    assert B3FnetCrawler.classify_corporate_notice("Aviso aos Cotistas", "6ª Emissão de Cotas") == "EMISSION"
    assert B3FnetCrawler.classify_corporate_notice("Fato Relevante", "Direito de Subscrição e Sobras") == "EMISSION"
    assert B3FnetCrawler.classify_corporate_notice("Fato Relevante", "Desdobramento de ações 1:2") == "CORP_EVENT"
    assert B3FnetCrawler.classify_corporate_notice("Informe Mensal Estruturado", "") is None


def test_process_corporate_notices_creates_alert_and_draft_emission_deduped(monkeypatch):
    SessionLocal = _setup_memory_db(monkeypatch)
    recent_str = (datetime.now() - timedelta(days=2)).strftime("%d/%m/%Y %H:%M")
    old_str = (datetime.now() - timedelta(days=45)).strftime("%d/%m/%Y %H:%M")

    with SessionLocal() as session:
        user = User(id=1, username="Fabricio", password_hash="x")
        cat = Category(id=1, name="FII")
        asset = Asset(id=10, ticker="HGLG11", cnpj="11728688000147", category_id=1, currency="BRL")
        pos = Position(id=1, asset_id=10, user_id=1, quantity=Decimal("100"), average_price=Decimal("150"))
        session.add_all([user, cat, asset, pos])
        session.commit()

        notices = [
            {
                "doc_id": "991001",
                "kind": "EMISSION",
                "title": "Fato Relevante - 10ª Emissão de Cotas",
                "date": recent_str,
                "link": "https://fnet.bmfbovespa.com.br/fnet/publico/downloadDocumento?id=991001",
            },
            {
                "doc_id": "991002",
                "kind": "EMISSION",
                "title": "Emissão Antiga",
                "date": old_str,
                "link": "https://fnet.bmfbovespa.com.br/fnet/publico/downloadDocumento?id=991002",
            },
        ]

        monkeypatch.setattr("utils.notifier.is_telegram_configured", lambda: False)
        _process_corporate_notices(session, pos, asset, notices, "B3_FNET")
        session.commit()
        _process_corporate_notices(session, pos, asset, notices, "B3_FNET")
        session.commit()

        alerts = session.query(TriggeredAlert).all()
        assert len(alerts) == 1
        assert alerts[0].condition == "EMISSION_ANNOUNCED"
        assert alerts[0].ticker == "HGLG11"

        events = session.query(CorporateEvent).filter_by(type="EMISSION").all()
        assert len(events) == 2


def test_emissions_crud_and_cumulative_simulation(monkeypatch):
    from backend import app

    SessionLocal = _setup_memory_db(monkeypatch)
    with SessionLocal() as session:
        user = User(id=1, username="Fabricio", password_hash="x")
        cat = Category(id=1, name="FII")
        asset = Asset(id=20, ticker="MXRF11", cnpj="97521225000125", category_id=1, currency="BRL")
        pos = Position(id=2, asset_id=20, user_id=1, quantity=Decimal("150"), average_price=Decimal("10"))
        tx1 = AssetTransaction(
            position_id=2,
            user_id=1,
            ticker="MXRF11",
            type="BUY",
            quantity=Decimal("100"),
            unit_price=Decimal("10"),
            total_value=Decimal("1000"),
            transaction_date=datetime(2024, 1, 10),
        )
        tx2 = AssetTransaction(
            position_id=2,
            user_id=1,
            ticker="MXRF11",
            type="BUY",
            quantity=Decimal("50"),
            unit_price=Decimal("10"),
            total_value=Decimal("500"),
            transaction_date=datetime(2024, 6, 10),
        )
        session.add_all([user, cat, asset, pos, tx1, tx2])
        session.commit()

    monkeypatch.setitem(app.config, "TESTING", True)
    client = app.test_client()
    cookies = {"assetflow_session": "valid"}

    # Emissão 1 antes da segunda compra (base 100 * 20% = +20 cotas)
    r1 = client.post(
        "/api/emissions",
        json={
            "ticker": "MXRF11",
            "date": "2024-03-01",
            "factor_pct": 20,
            "unit_cost": 10.0,
            "subscribed_qty": 0,
            "title": "8ª Emissão",
        },
        headers={"Cookie": "assetflow_session=valid"},
    )
    assert r1.status_code == 200
    item = r1.get_json()["items"][0]
    assert item["current_qty"] == 150.0
    assert item["theoretical_qty"] == 170.0
    em1_id = item["emissions"][0]["id"]

    # Emissão 2 após segunda compra: base real 150 + 20 teóricas = 170 * 10% = +17 cotas => 187 total
    r2 = client.post(
        "/api/emissions",
        json={
            "ticker": "MXRF11",
            "date": "2024-08-01",
            "factor_pct": 10,
            "unit_cost": 9.5,
            "subscribed_qty": 0,
            "title": "9ª Emissão",
        },
        headers={"Cookie": "assetflow_session=valid"},
    )
    assert r2.status_code == 200
    item2 = r2.get_json()["items"][0]
    assert item2["missed_total_qty"] == 37.0
    assert item2["theoretical_qty"] == 187.0
    assert item2["total_theoretical_cost"] == round(20 * 10.0 + 17 * 9.5, 2)

    # Delete primeira emissão -> sobra apenas a 2ª sobre base real 150 * 10% = +15
    d1 = client.delete(f"/api/emissions/{em1_id}", headers={"Cookie": f"assetflow_session={cookies['assetflow_session']}"})
    assert d1.status_code == 200
    g1 = client.get("/api/emissions?ticker=MXRF11", headers={"Cookie": "assetflow_session=valid"})
    assert g1.status_code == 200
    assert g1.get_json()["items"][0]["theoretical_qty"] == 165.0
