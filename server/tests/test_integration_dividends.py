from datetime import date, datetime, timedelta
from unittest.mock import MagicMock, patch
import pandas as pd
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from db.models import Asset, AssetTransaction, Base, Category, Dividend, Position, User
from services_modules.integration import IntegrationService


def test_record_confirmed_dividends_statusinvest_fallback_and_normalization(monkeypatch):
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

    monkeypatch.setattr("services_modules.integration.Session", _CtxSession)

    with SessionLocal() as seed:
        user = User(id=1, username="Fabricio", password_hash="x")
        cat_cripto = Category(id=1, name="Cripto")
        cat_reserva = Category(id=2, name="Reserva")
        ethy = Asset(id=10, ticker="ETHY11", category_id=1, currency="BRL")
        reserva = Asset(id=11, ticker="NUBANK TURBO", category_id=2, currency="BRL")
        seed.add_all([user, cat_cripto, cat_reserva, ethy, reserva])
        seed.flush()

        pos_ethy = Position(user_id=1, asset_id=10, quantity=5, average_price=103.59)
        pos_res = Position(user_id=1, asset_id=11, quantity=1, average_price=9559.75)
        first_tx = AssetTransaction(
            user_id=1,
            position_id=1,
            ticker="ETHY11",
            type="BUY",
            quantity=5,
            unit_price=103.59,
            total_value=517.95,
            transaction_date=datetime(2026, 1, 7),
        )
        stale_div = Dividend(
            asset_id=10,
            user_id=1,
            date_com=date(2026, 2, 13),
            date_payment=None,
            type="Rendimento",
            value_per_share=1.7476,
            quantity_at_date=5,
            total_value=8.738,
            status="A RECEBER",
        )
        seed.add_all([pos_ethy, pos_res, first_tx, stale_div])
        seed.commit()

    si_payload = {
        "assetEarningsModels": [
            # Before first BUY (2026-01-07) -> must be ignored
            {"ed": "23/12/2025", "pd": "09/01/2026", "et": "Rendimento", "v": 2.896},
            # Already exists on 2026-02-13 -> must NOT duplicate
            {"ed": "13/02/2026", "pd": "09/03/2026", "et": "Rendimento", "v": 1.7476},
            # Missing payment -> must be inserted
            {"ed": "20/01/2026", "pd": "09/02/2026", "et": "Rendimento", "v": 2.9895},
        ]
    }
    mock_http_sess = MagicMock()
    mock_http_sess.get.return_value = MagicMock(status_code=200, json=lambda: si_payload)

    empty_ticker = MagicMock()
    empty_ticker.dividends = pd.Series(dtype=float)

    svc = IntegrationService()
    with patch("utils.http_client.get_secure_session", return_value=mock_http_sess), \
         patch("services_modules.integration.yf.Ticker", return_value=empty_ticker) as mock_yf:
        assert svc.record_confirmed_dividends(user_id=1) is True

    # Reserva skipped from Yahoo/StatusInvest
    called_tickers = [c.args[0] for c in mock_yf.call_args_list]
    assert called_tickers == ["ETHY11.SA"]

    with SessionLocal() as check:
        divs = check.query(Dividend).filter_by(user_id=1, asset_id=10).order_by(Dividend.date_com).all()
        assert len(divs) == 2
        assert [d.date_com for d in divs] == [date(2026, 1, 20), date(2026, 2, 13)]
        assert all(d.status == "PAGO" for d in divs)
        assert divs[1].date_payment == date(2026, 2, 13) + timedelta(days=15)
        assert divs[0].type == "Rendimento"
