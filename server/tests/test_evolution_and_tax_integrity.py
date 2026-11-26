from datetime import date, datetime, timedelta
from decimal import Decimal
import json

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import scoped_session, sessionmaker
from werkzeug.security import generate_password_hash

from db.models import (
    Asset,
    AssetTransaction,
    Base,
    Category,
    CorporateEvent,
    Dividend,
    MarketData,
    PortfolioSnapshot,
    Position,
    SystemCache,
    User,
)
from domain.portfolio import attribution as attr_mod
from domain.portfolio import xirr as xirr_mod
from domain.tax import annual_irpf as irpf_mod
from domain.tax import tax_engine as tax_mod


@pytest.fixture
def tax_db(tmp_path, monkeypatch):
    db_file = tmp_path / "tax_evolution.db"
    engine = create_engine(f"sqlite:///{db_file}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    TestSession = scoped_session(sessionmaker(bind=engine))

    import db.session as db_session_mod

    monkeypatch.setattr(db_session_mod, "Session", TestSession)
    monkeypatch.setattr(irpf_mod, "Session", TestSession)
    monkeypatch.setattr(tax_mod, "Session", TestSession)

    with TestSession() as session:
        session.add_all([
            User(id=1, username="u1", password_hash=generate_password_hash("Pass123!")),
            Category(id=1, name="Ação", target_percent=Decimal("40")),
            Category(id=2, name="Cripto", target_percent=Decimal("10")),
            Category(id=3, name="Renda Fixa", target_percent=Decimal("30")),
            Category(id=4, name="Internacional", target_percent=Decimal("20")),
        ])
        session.commit()

    yield TestSession
    TestSession.remove()
    engine.dispose()


def test_annual_irpf_bonus_no_double_spinoff_and_paid_dividends_only(tax_db):
    with tax_db() as session:
        a1 = Asset(id=10, ticker="ITSA4", category_id=1)
        a2 = Asset(id=11, ticker="CHILD3", category_id=1)
        session.add_all([a1, a2])
        session.flush()

        p1 = Position(id=10, user_id=1, asset_id=10, quantity=Decimal("82.5"), average_price=Decimal("7.5"))
        session.add(p1)
        session.flush()

        # 100 bought @ 10 (total 1000); BONUS stored total qty = 110; SPIN_OFF 25% of cost -> remaining 75% (750)
        session.add_all([
            AssetTransaction(
                id=1, user_id=1, position_id=10, ticker="ITSA4", type="BUY",
                quantity=Decimal("100"), unit_price=Decimal("10"), total_value=Decimal("1000"),
                transaction_date=datetime(2025, 1, 10),
            ),
            AssetTransaction(
                id=2, user_id=1, position_id=10, ticker="ITSA4", type="BONUS",
                quantity=Decimal("110"), unit_price=Decimal("9.09"), total_value=Decimal("0"),
                transaction_date=datetime(2025, 3, 1),
            ),
            CorporateEvent(id=50, asset_id=10, user_id=1, type="SPIN_OFF", date=date(2025, 6, 1), percent=Decimal("25")),
            AssetTransaction(
                id=3, user_id=1, position_id=10, ticker="ITSA4", type="SPIN_OFF",
                quantity=Decimal("110"), unit_price=Decimal("6.8182"), total_value=Decimal("0"),
                corporate_event_id=50,
                transaction_date=datetime(2025, 6, 1),
            ),
            # Only PAGO dividends must count into annual IRPF rendimentos
            Dividend(
                user_id=1, asset_id=10, date_com=date(2025, 5, 1), date_payment=date(2025, 5, 15),
                type="Dividendo", value_per_share=Decimal("1"), quantity_at_date=Decimal("110"),
                total_value=Decimal("110"), status="PAGO",
            ),
            Dividend(
                user_id=1, asset_id=10, date_com=date(2025, 12, 1), date_payment=date(2025, 12, 20),
                type="Dividendo", value_per_share=Decimal("2"), quantity_at_date=Decimal("110"),
                total_value=Decimal("220"), status="A RECEBER",
            ),
        ])
        session.commit()

    res = irpf_mod.calculate_annual_irpf(1, 2025)
    assert res["year"] == 2025
    bens = {b["ticker"]: b for b in res["bens_e_direitos"]}
    assert "ITSA4" in bens
    # Bonus qty=110 (not doubled to 210!) and Spin-off drops cost 1000 * 0.75 = 750
    assert abs(bens["ITSA4"]["quantity"] - 110.0) < 0.01
    assert abs(bens["ITSA4"]["total_cost"] - 750.0) < 1.0

    rend = res["rendimentos_isentos"]
    assert rend["dividendos"] == 110.0


def test_tax_engine_crypto_exemption_and_rf_intl_exclusion(tax_db):
    with tax_db() as session:
        a_btc = Asset(id=20, ticker="BTC-USD", category_id=2)
        a_rf = Asset(id=21, ticker="TESOURO_IPCA", category_id=3)
        a_usd = Asset(id=22, ticker="AAPL", category_id=4)
        session.add_all([a_btc, a_rf, a_usd])
        session.flush()

        p_btc = Position(id=20, user_id=1, asset_id=20, quantity=Decimal("0"), average_price=Decimal("100000"))
        p_rf = Position(id=21, user_id=1, asset_id=21, quantity=Decimal("0"), average_price=Decimal("5000"))
        p_usd = Position(id=22, user_id=1, asset_id=22, quantity=Decimal("0"), average_price=Decimal("100"))
        session.add_all([p_btc, p_rf, p_usd])
        session.flush()

        # Crypto sell of R$ 25,000 (< R$ 35,000 exemption) -> tax 0
        # Renda Fixa & Internacional sells should NOT enter Brazilian swing DARF
        session.add_all([
            AssetTransaction(
                user_id=1, position_id=20, ticker="BTC-USD", type="SELL", quantity=Decimal("0.25"),
                unit_price=Decimal("100000"), total_value=Decimal("25000"),
                cost_basis=Decimal("80000"), transaction_date=datetime(2025, 4, 10),
            ),
            AssetTransaction(
                user_id=1, position_id=21, ticker="TESOURO_IPCA", type="SELL", quantity=Decimal("10"),
                unit_price=Decimal("600"), total_value=Decimal("6000"),
                cost_basis=Decimal("500"), transaction_date=datetime(2025, 4, 15),
            ),
            AssetTransaction(
                user_id=1, position_id=22, ticker="AAPL", type="SELL", quantity=Decimal("10"),
                unit_price=Decimal("150"), total_value=Decimal("1500"),
                cost_basis=Decimal("100"), transaction_date=datetime(2025, 4, 20),
            ),
        ])
        session.commit()

    darf = tax_mod.calculate_monthly_darf(1, 4, 2025)
    assert darf["darf"]["darf_to_pay"] == 0.0
    assert darf["profits"]["stocks_st"] == 0.0
    assert darf["sales_total_stocks"] == 0.0


def test_tax_engine_intraday_partial_day_trade_and_carry_forward(tax_db):
    with tax_db() as session:
        a_stk = Asset(id=30, ticker="PETR4", category_id=1)
        session.add(a_stk)
        session.flush()
        p_stk = Position(id=30, user_id=1, asset_id=30, quantity=Decimal("0"), average_price=Decimal("30"))
        session.add(p_stk)
        session.flush()

        # Jan loss: swing sell below cost (-1000 loss to carry forward)
        session.add(
            AssetTransaction(
                user_id=1, position_id=30, ticker="PETR4", type="SELL", quantity=Decimal("100"),
                unit_price=Decimal("20"), total_value=Decimal("2000"),
                cost_basis=Decimal("30"), transaction_date=datetime(2025, 1, 15),
            )
        )
        # Feb partial intraday Day Trade + swing sell: buy 100 @ 30, sell 250 @ 40 -> 100 DT + 150 swing
        session.add_all([
            AssetTransaction(
                user_id=1, position_id=30, ticker="PETR4", type="BUY", quantity=Decimal("100"),
                unit_price=Decimal("30"), total_value=Decimal("3000"),
                transaction_date=datetime(2025, 2, 10, 10, 0),
            ),
            AssetTransaction(
                user_id=1, position_id=30, ticker="PETR4", type="SELL", quantity=Decimal("250"),
                unit_price=Decimal("40"), total_value=Decimal("10000"),
                cost_basis=Decimal("30"), transaction_date=datetime(2025, 2, 10, 15, 0),
            ),
        ])
        session.commit()

    darf_feb = tax_mod.calculate_monthly_darf(1, 2, 2025)
    # Matched DT: 100 / 250 = 40% -> DT profit = 100*(40-30)=1000, DT tax=20% = 200
    # Swing portion (150 shares @ 40 = 6000) is exempt (< 20k) -> DT stays taxable!
    assert abs(darf_feb["profits"]["stocks_dt"] - 1000.0) < 0.01
    assert abs(darf_feb["taxes"]["stocks_dt"] - 200.0) < 0.01
    assert abs(darf_feb["sales_total_stocks"] - 6000.0) < 0.01


def test_attribution_treats_deposit_withdraw_as_external_cashflow(tax_db):
    with tax_db() as session:
        a_res = Asset(id=40, ticker="CAIXINHA", category_id=3)
        session.add(a_res)
        session.flush()
        p_res = Position(id=40, user_id=1, asset_id=40, quantity=Decimal("1"), average_price=Decimal("10000"))
        session.add(p_res)
        session.flush()

        d_start = date(2025, 1, 1)
        d_m2 = date(2025, 2, 1)
        d_end = date(2025, 2, 28)
        session.add_all([
            PortfolioSnapshot(user_id=1, date=d_start, total_equity=Decimal("1000"), total_invested=Decimal("1000"), profit=Decimal("0")),
            PortfolioSnapshot(user_id=1, date=d_m2, total_equity=Decimal("11000"), total_invested=Decimal("11000"), profit=Decimal("0")),
            PortfolioSnapshot(user_id=1, date=d_end, total_equity=Decimal("11110"), total_invested=Decimal("11000"), profit=Decimal("110")),
            AssetTransaction(
                user_id=1, position_id=40, ticker="CAIXINHA", type="DEPOSIT", quantity=Decimal("1"),
                unit_price=Decimal("10000"), total_value=Decimal("10000"),
                transaction_date=datetime(2025, 2, 1),
            ),
            SystemCache(key="ipca_hist_12m", value=json.dumps([])),
            SystemCache(key="selic_hist", value=json.dumps([])),
        ])
        session.commit()

        res = attr_mod.calculate_monthly_attribution(session, 1)
        feb_rows = [r for r in res.get("series", []) if r["year"] == 2025 and r["month"] == 2]
        assert len(feb_rows) == 1
        # Capital gain excludes R$ 10k deposit (never +10k+)
        assert feb_rows[0]["aportes_liquidos"] == 10000.0
        assert feb_rows[0]["variacao_mercado"] < 2000.0

        # Also smoke check XIRR annualized return helper works on valid cashflows
        irr = xirr_mod.calculate_xirr([(date(2025, 1, 1), -1000.0), (date(2025, 12, 31), 1150.0)])
        assert irr is not None and 0.14 < irr < 0.16
