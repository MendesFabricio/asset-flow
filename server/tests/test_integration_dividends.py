from datetime import date, datetime, timedelta
from unittest.mock import MagicMock, patch
import pandas as pd
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from db.models import Asset, AssetTransaction, Base, Category, Dividend, Position, User
from services_modules.integration import (
    IntegrationService,
    _compute_net_dividend_total,
    _compute_qty_at_date,
)


def test_compute_net_dividend_total_and_qty_at_date():
    tp_jcp, net_jcp = _compute_net_dividend_total("JCP", "Ação", "ITUB3", 0.362, 38)
    assert tp_jcp == "Juros Sobre Capital Próprio"
    assert net_jcp == pytest.approx(round(0.362 * 38 * 0.85, 2), abs=0.01)

    tp_eth, net_eth = _compute_net_dividend_total("Rendimento", "Cripto", "ETHY11", 2.9895, 5)
    assert tp_eth == "Rendimento"
    assert net_eth == pytest.approx(round(2.9895 * 5 * 0.85, 2), abs=0.01)

    tp_trib, net_trib = _compute_net_dividend_total("Rend. Tributado", "Ação", "PETR4", 0.0165, 26)
    assert tp_trib == "Rendimento"
    assert net_trib == pytest.approx(round(0.0165 * 26 * 0.775, 2), abs=0.01)

    txs = [
        MagicMock(id=1, type="BUY", quantity=35.0, transaction_date=datetime(2025, 1, 2)),
        MagicMock(id=2, type="BONUS", quantity=41.2, transaction_date=datetime(2025, 12, 29)),
        MagicMock(id=3, type="SELL", quantity=0.2, transaction_date=datetime(2025, 12, 29)),
    ]
    assert _compute_qty_at_date(41.0, txs, date(2024, 12, 1)) == 0.0
    assert _compute_qty_at_date(41.0, txs, date(2025, 12, 9)) == 35.0
    assert _compute_qty_at_date(41.0, txs, date(2026, 1, 30)) == 41.0


def test_record_confirmed_dividends_statusinvest_enrichment_net_irrf_and_upcoming(monkeypatch):
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

    future_pay = date.today() + timedelta(days=14)
    future_pay_str = future_pay.strftime("%d/%m/%Y")
    recent_com = date.today() - timedelta(days=1)
    recent_com_str = recent_com.strftime("%d/%m/%Y")

    with SessionLocal() as seed:
        user = User(id=1, username="Fabricio", password_hash="x")
        cat_cripto = Category(id=1, name="Cripto")
        cat_reserva = Category(id=2, name="Reserva")
        cat_acao = Category(id=3, name="Ação")
        ethy = Asset(id=10, ticker="ETHY11", category_id=1, currency="BRL")
        reserva = Asset(id=11, ticker="NUBANK TURBO", category_id=2, currency="BRL")
        petr = Asset(id=12, ticker="PETR4", category_id=3, currency="BRL")
        seed.add_all([user, cat_cripto, cat_reserva, cat_acao, ethy, reserva, petr])
        seed.flush()

        seed.add_all([
            Position(user_id=1, asset_id=10, quantity=5, average_price=103.59),
            Position(user_id=1, asset_id=11, quantity=1, average_price=9559.75),
            Position(user_id=1, asset_id=12, quantity=26, average_price=35.0),
            AssetTransaction(
                user_id=1, position_id=1, ticker="ETHY11", type="BUY",
                quantity=5, unit_price=103.59, total_value=517.95, transaction_date=datetime(2026, 1, 7),
            ),
            AssetTransaction(
                user_id=1, position_id=3, ticker="PETR4", type="BUY",
                quantity=26, unit_price=35.0, total_value=910.0, transaction_date=datetime(2021, 1, 6),
            ),
            # Paid B3 Excel row with placeholder date_com == date_payment and Dividendo/Rendimento label variance
            Dividend(
                asset_id=10, user_id=1, date_com=date(2026, 2, 9), date_payment=date(2026, 2, 9),
                type="Rendimento", value_per_share=2.99, quantity_at_date=5, total_value=12.70, status="PAGO",
            ),
            Dividend(
                asset_id=10, user_id=1, date_com=date(2026, 5, 11), date_payment=date(2026, 5, 11),
                type="Rendimento", value_per_share=1.792, quantity_at_date=5, total_value=7.61, status="PAGO",
            ),
            # Paid PETR4 same-date Dividendo + Rendimento (Rend. Tributado) placeholders
            Dividend(
                asset_id=12, user_id=1, date_com=date(2026, 3, 20), date_payment=date(2026, 3, 20),
                type="Dividendo", value_per_share=0.296, quantity_at_date=26, total_value=7.70, status="PAGO",
            ),
            Dividend(
                asset_id=12, user_id=1, date_com=date(2026, 3, 20), date_payment=date(2026, 3, 20),
                type="Rendimento", value_per_share=0.009, quantity_at_date=26, total_value=0.18, status="PAGO",
            ),
        ])
        seed.commit()

    future_pay2 = date.today() + timedelta(days=42)
    future_pay2_str = future_pay2.strftime("%d/%m/%Y")

    def _si_side_effect(url):
        if "ticker=ETHY11" in url and "/etf/" in url:
            return MagicMock(status_code=200, json=lambda: {
                "assetEarningsModels": [
                    {"ed": "23/12/2025", "pd": "09/01/2026", "et": "Rendimento", "v": 2.896},
                    {"ed": "20/01/2026", "pd": "09/02/2026", "et": "Rendimento", "v": 2.9895},
                    {"ed": "20/04/2026", "pd": "11/05/2026", "et": "Dividendo", "v": 1.7917},
                    {"ed": recent_com_str, "pd": future_pay_str, "et": "Rendimento", "v": 1.2068},
                ]
            })
        if "ticker=PETR4" in url and "/acao/" in url:
            return MagicMock(status_code=200, json=lambda: {
                "assetEarningsModels": [
                    {"ed": "22/12/2025", "pd": "20/03/2026", "et": "Dividendo", "v": 0.2964},
                    {"ed": "22/12/2025", "pd": "20/03/2026", "et": "Rend. Tributado", "v": 0.0090},
                    {"ed": recent_com_str, "pd": future_pay_str, "et": "Dividendo", "v": 0.5937},
                    {"ed": recent_com_str, "pd": future_pay2_str, "et": "Dividendo", "v": 0.5937},
                ]
            })
        return MagicMock(status_code=404, json=lambda: None)

    mock_http_sess = MagicMock()
    mock_http_sess.get.side_effect = _si_side_effect
    empty_ticker = MagicMock()
    empty_ticker.dividends = pd.Series(dtype=float)

    svc = IntegrationService()
    with patch("utils.http_client.get_secure_session", return_value=mock_http_sess), \
         patch("services_modules.integration.yf.Ticker", return_value=empty_ticker) as mock_yf:
        assert svc.record_confirmed_dividends(user_id=1) is True

    called_tickers = sorted(c.args[0] for c in mock_yf.call_args_list)
    assert called_tickers == ["ETHY11.SA", "PETR4.SA"]

    with SessionLocal() as check:
        ethy_divs = check.query(Dividend).filter_by(user_id=1, asset_id=10).order_by(Dividend.date_payment).all()
        assert len(ethy_divs) == 3
        assert ethy_divs[0].date_com == date(2026, 1, 20)
        assert ethy_divs[1].date_com == date(2026, 4, 20)
        assert float(ethy_divs[1].total_value) == pytest.approx(7.61, abs=0.01)
        assert ethy_divs[2].date_payment == future_pay
        assert ethy_divs[2].status == "A RECEBER"
        assert float(ethy_divs[2].total_value) == pytest.approx(round(1.2068 * 5 * 0.85, 2), abs=0.01)

        petr_divs = check.query(Dividend).filter_by(user_id=1, asset_id=12).order_by(Dividend.date_payment, Dividend.id).all()
        assert len(petr_divs) == 4
        assert [d.date_payment for d in petr_divs[:2]] == [date(2026, 3, 20), date(2026, 3, 20)]
        assert all(d.date_com == date(2025, 12, 22) for d in petr_divs[:2])
        assert [d.date_payment for d in petr_divs[2:]] == [future_pay, future_pay2]
        assert all(d.status == "A RECEBER" for d in petr_divs[2:])
        assert float(petr_divs[2].total_value) == pytest.approx(round(0.5937 * 26, 2), abs=0.01)


def test_yoc_history_uses_moment_pm_split_and_market_dy(monkeypatch):
    from backend import app
    from db.models import MarketData

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

    monkeypatch.setattr("routes.dividends.Session", _CtxSession)
    monkeypatch.setattr("routes.auth.verify_session_token", lambda _: {"user_id": 1, "username": "Fabricio"})

    with SessionLocal() as seed:
        user = User(id=1, username="Fabricio", password_hash="x")
        cat_fii = Category(id=1, name="FII")
        hgbs = Asset(id=1, ticker="HGBS11", category_id=1, currency="BRL")
        seed.add_all([user, cat_fii, hgbs])
        seed.flush()

        # Position today: 50 shares, PM 20.50 (after 1:10 split + later purchase)
        pos = Position(id=1, user_id=1, asset_id=1, quantity=50, average_price=20.50)
        seed.add(pos)
        seed.flush()

        seed.add_all([
            AssetTransaction(
                user_id=1, position_id=1, ticker="HGBS11", type="BUY",
                quantity=4, unit_price=205.50, total_value=822.00, transaction_date=datetime(2024, 1, 10),
            ),
            AssetTransaction(
                user_id=1, position_id=1, ticker="HGBS11", type="SPLIT",
                quantity=40, unit_price=20.55, total_value=0.0, transaction_date=datetime(2025, 5, 13),
            ),
            AssetTransaction(
                user_id=1, position_id=1, ticker="HGBS11", type="BUY",
                quantity=10, unit_price=20.30, total_value=203.00, transaction_date=datetime(2025, 12, 1),
            ),
            # 2024 dividend when PM was 205.50
            Dividend(
                asset_id=1, user_id=1, date_com=date(2024, 6, 14), date_payment=date(2024, 6, 20),
                type="Rendimento", value_per_share=1.60, quantity_at_date=4, total_value=6.40, status="PAGO",
            ),
            # May 2025 dividend declared on 4 pre-split shares (2 days after DB split date)
            Dividend(
                asset_id=1, user_id=1, date_com=date(2025, 5, 15), date_payment=date(2025, 5, 15),
                type="Rendimento", value_per_share=1.60, quantity_at_date=4, total_value=6.40, status="PAGO",
            ),
            # December 2025 dividend after BUY changed PM from 20.55 -> 20.50 (gross vps=0.20, net=0.17/cota)
            Dividend(
                asset_id=1, user_id=1, date_com=date(2025, 12, 12), date_payment=date(2025, 12, 18),
                type="Juros Sobre Capital Próprio", value_per_share=0.20, quantity_at_date=50, total_value=8.50, status="PAGO",
            ),
            # Future pending dividend must NOT inflate realized YoC history
            Dividend(
                asset_id=1, user_id=1, date_com=date(2026, 11, 20), date_payment=date(2026, 11, 27),
                type="Rendimento", value_per_share=0.20, quantity_at_date=50, total_value=10.00, status="A RECEBER",
            ),
            MarketData(asset_id=1, date=datetime(2024, 6, 14), price=220.00),
            MarketData(asset_id=1, date=datetime(2025, 5, 12), price=200.00),
            MarketData(asset_id=1, date=datetime(2025, 12, 12), price=19.50),
        ])
        seed.commit()

    app.config["TESTING"] = True
    with app.test_client() as client:
        client.set_cookie("assetflow_session", "mocked_token")
        resp = client.get("/api/dividends/yoc-history")
        assert resp.status_code == 200
        data = resp.get_json()

    assert set(data.keys()) == {"HGBS11", "CARTEIRA"}
    hgbs_rows = data["HGBS11"]
    assert [r["year"] for r in hgbs_rows] == [2024, 2025]

    y2024, y2025 = hgbs_rows
    # 2024: PM at moment 205.50 (not today's 20.50!)
    assert y2024["pm_at_moment"] == pytest.approx(205.50, abs=0.01)
    assert y2024["market_price"] == pytest.approx(220.00, abs=0.01)
    assert y2024["yoc"] == pytest.approx(round(1.60 / 205.50 * 100, 2), abs=0.02)
    assert y2024["dy_market"] == pytest.approx(round(1.60 / 220.00 * 100, 2), abs=0.02)
    assert y2024["total_received"] == pytest.approx(6.40, abs=0.01)

    # 2025: May event stays pre-split (PM=205.50, Cot=200.00) + Dec event uses PM=20.50, Cot=19.50
    expected_2025_yoc = (1.60 / 205.50 * 100) + (0.17 / 20.50 * 100)
    expected_2025_dy = (1.60 / 200.00 * 100) + (0.17 / 19.50 * 100)
    assert y2025["yoc"] == pytest.approx(expected_2025_yoc, abs=0.02)
    assert y2025["dy_market"] == pytest.approx(expected_2025_dy, abs=0.02)
    assert y2025["pm_at_moment"] == pytest.approx(20.50, abs=0.01)
    assert len(y2025["events"]) == 2
    assert y2025["events"][0]["pm_at_moment"] == pytest.approx(205.50, abs=0.01)
    assert y2025["events"][1]["pm_at_moment"] == pytest.approx(20.50, abs=0.01)
    assert y2025["events"][0]["ticker"] == "HGBS11"

    carteira_rows = data["CARTEIRA"]
    assert [r["year"] for r in carteira_rows] == [2024, 2025]
    assert carteira_rows[0]["total_received"] == pytest.approx(6.40, abs=0.01)
    assert carteira_rows[0]["pm_at_moment"] == pytest.approx(822.00, abs=0.01)
    assert carteira_rows[1]["total_received"] == pytest.approx(14.90, abs=0.01)
    assert all(ev["ticker"] == "HGBS11" for r in carteira_rows for ev in r["events"])
