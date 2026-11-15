from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from db.models import Asset, Base, Category, Position, User
from infrastructure.market_data import (
    sync_reports_with_fnet,
    update_fundamentals,
    update_prices,
)


@pytest.fixture
def mem_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    LocalSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    sess = LocalSession()
    try:
        u1 = User(id=1, username="user1", password_hash="h1")
        u2 = User(id=2, username="user2", password_hash="h2")
        cat_acao = Category(id=1, name="Ação", target_percent=Decimal("50"))
        cat_fii = Category(id=2, name="FII", target_percent=Decimal("50"))
        sess.add_all([u1, u2, cat_acao, cat_fii])
        sess.flush()

        # Held by user 1
        a_held = Asset(ticker="PETR4", name="PETROBRAS", category_id=1, currency="BRL", cnpj="33000167000101", cvm_code="9512")
        # Sold / zeroed by user 1 (even with target_percent > 0)
        a_zero = Asset(ticker="VALE3", name="VALE", category_id=1, currency="BRL", cnpj="33592510000154", cvm_code="4170")
        # Held only by user 2
        a_other = Asset(ticker="ITUB4", name="ITAU", category_id=1, currency="BRL", cnpj="60872504000123", cvm_code="19348")
        # FII held by user 1 vs zeroed by user 1
        f_held = Asset(ticker="HGLG11", name="CSHG LOG", category_id=2, currency="BRL", cnpj="11728688000147")
        f_zero = Asset(ticker="MXRF11", name="MAXI RENDA", category_id=2, currency="BRL", cnpj="97521225000125")
        sess.add_all([a_held, a_zero, a_other, f_held, f_zero])
        sess.flush()

        sess.add_all([
            Position(asset_id=a_held.id, user_id=1, quantity=Decimal("10"), average_price=Decimal("30"), target_percent=Decimal("10")),
            Position(asset_id=a_zero.id, user_id=1, quantity=Decimal("0"), average_price=Decimal("0"), target_percent=Decimal("10")),
            Position(asset_id=a_held.id, user_id=2, quantity=Decimal("5"), average_price=Decimal("25"), target_percent=Decimal("10")),
            Position(asset_id=a_other.id, user_id=2, quantity=Decimal("20"), average_price=Decimal("30"), target_percent=Decimal("10")),
            Position(asset_id=f_held.id, user_id=1, quantity=Decimal("15"), average_price=Decimal("160"), target_percent=Decimal("10")),
            Position(asset_id=f_zero.id, user_id=1, quantity=Decimal("0"), average_price=Decimal("0"), target_percent=Decimal("0")),
        ])
        sess.commit()
        yield sess
    finally:
        sess.close()
        engine.dispose()


def test_update_prices_fetches_only_held_positions_for_user(mem_session):
    captured = {}

    def fake_download(tickers, **kwargs):
        captured["tickers"] = sorted(tickers)
        return pd.DataFrame()

    with patch("infrastructure.market_data.yf.download", side_effect=fake_download), \
         patch("infrastructure.market_data.yf.Ticker") as mock_ticker:
        mock_ticker.return_value.history.return_value = pd.DataFrame()
        update_prices(mem_session, lambda: None, user_id=1)

    assert captured["tickers"] == ["HGLG11.SA", "PETR4.SA"]

    with patch("infrastructure.market_data.yf.download", side_effect=fake_download), \
         patch("infrastructure.market_data.yf.Ticker") as mock_ticker:
        mock_ticker.return_value.history.return_value = pd.DataFrame()
        update_prices(mem_session, lambda: None, user_id=None)

    assert captured["tickers"] == ["HGLG11.SA", "ITUB4.SA", "PETR4.SA"]


def test_update_fundamentals_fetches_and_updates_only_held_positions_of_user(mem_session):
    called_symbols = []

    class FakeSessionCtx:
        def __new__(cls):
            return mem_session

        @staticmethod
        def remove():
            pass

    def fake_yf_ticker(symbol, session=None):
        called_symbols.append(symbol)
        obj = MagicMock()
        obj.fast_info = SimpleNamespace(last_price=40.0)
        obj.dividends = pd.Series(dtype=float)
        obj.info = {"trailingEps": 4.0, "bookValue": 20.0}
        obj.splits = pd.Series(dtype=float)
        return obj

    with patch("db.session.Session", FakeSessionCtx), \
         patch("infrastructure.market_data.yf.Ticker", side_effect=fake_yf_ticker), \
         patch("db.models.safe_commit", side_effect=lambda s: s.commit()):
        update_fundamentals(lambda: 5.0, user_id=1)

    assert sorted(called_symbols) == ["HGLG11.SA", "PETR4.SA"]

    petr = mem_session.query(Asset).filter_by(ticker="PETR4").first()
    pos_u1 = mem_session.query(Position).filter_by(asset_id=petr.id, user_id=1).first()
    pos_u2 = mem_session.query(Position).filter_by(asset_id=petr.id, user_id=2).first()
    assert float(pos_u1.manual_lpa) == pytest.approx(4.0)
    assert pos_u2.manual_lpa is None


def test_sync_reports_with_fnet_syncs_only_held_positions_of_user(mem_session):
    cvm_calls = []
    fnet_calls = []

    with patch("utils.cvm_processor.CVMProcessor.get_dashboard_data", side_effect=lambda code: cvm_calls.append(code) or None), \
         patch("crawlers.cvm_enet.CVMEnetCrawler.get_documents", return_value=None), \
         patch("crawlers.b3_fnet.B3FnetCrawler.get_documents_package", side_effect=lambda cnpj: fnet_calls.append(cnpj) or None):
        res = sync_reports_with_fnet(mem_session, user_id=1)

    assert res["status"] == "Sucesso"
    assert cvm_calls == ["9512"]
    assert fnet_calls == ["11728688000147"]


def test_cnpj_finder_includes_etfs_and_bdrs():
    from utils.cnpj_finder import CNPJFinder

    urls = []

    class FakeSession:
        def get(self, url, timeout=10):
            urls.append(url)
            if "/etfs/" in url:
                return SimpleNamespace(status_code=200, text="CNPJ: 61.689.798/0001-15")
            return SimpleNamespace(status_code=404, text="")

    with patch("utils.http_client.get_secure_session", return_value=FakeSession()):
        cnpj = CNPJFinder.find_by_ticker("VWRA11")

    assert cnpj == "61689798000115"
    assert any("/etfs/vwra11" in u for u in urls)


def test_sync_reports_route_returns_202_and_passes_user_id():
    from flask import Flask, g
    import routes.dashboard as dashboard_routes

    captured = {}

    class ImmediateThread:
        def __init__(self, target=None, args=(), daemon=None):
            self._target = target
            self._args = args

        def start(self):
            self._target(*self._args)

    app = Flask(__name__)
    app.register_blueprint(dashboard_routes.dashboard_bp)

    @app.before_request
    def _set_user():
        g.user_id = 7

    with patch.object(dashboard_routes, "CVM_SYNC_STATE", {"status": "idle"}), \
         patch.object(dashboard_routes.time, "sleep"), \
         patch.object(dashboard_routes.threading, "Thread", ImmediateThread), \
         patch.object(dashboard_routes.service, "sync_reports_with_fnet", side_effect=lambda **kw: captured.update(kw) or {"status": "Sucesso", "msg": "ok"}):
        client = app.test_client()
        resp = client.post("/api/sync-reports")

    assert resp.status_code == 202
    assert captured.get("user_id") == 7


def test_brt_timezone_keeps_same_day_until_2359_brt():
    from datetime import datetime, timezone
    from services_modules.dashboard import _BRT_TZ

    # 2026-11-14 02:30 UTC == 2026-11-13 23:30 BRT (still same trading day in Brazil)
    utc_late_night = datetime(2026, 11, 14, 2, 30, tzinfo=timezone.utc)
    assert utc_late_night.astimezone(_BRT_TZ).strftime("%Y-%m-%d") == "2026-11-13"

    # 2026-11-14 03:05 UTC == 2026-11-14 00:05 BRT (next day in Brazil)
    utc_after_midnight_brt = datetime(2026, 11, 14, 3, 5, tzinfo=timezone.utc)
    assert utc_after_midnight_brt.astimezone(_BRT_TZ).strftime("%Y-%m-%d") == "2026-11-14"


def test_extract_vpa_from_report_json():
    import json
    from infrastructure.market_data import _extract_vpa_from_report_json

    payload = json.dumps({
        "fundamentalist": {
            "cards_indicadores": [
                {"titulo": "P/VP", "valor_formatado": "0.89"},
                {"titulo": "VPA", "valor_formatado": "R$ 129.98"},
            ]
        }
    })
    assert _extract_vpa_from_report_json(payload) == 129.98
    assert _extract_vpa_from_report_json(None) == 0.0
    assert _extract_vpa_from_report_json("{invalid-json") == 0.0
