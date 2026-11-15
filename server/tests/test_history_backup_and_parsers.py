import json
from datetime import date, datetime
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend import app
from db.models import (
    Asset,
    AssetTransaction,
    Base,
    Category,
    CorporateEvent,
    Dividend,
    FixedIncome,
    MarketData,
    MonthlyPortfolioSnapshot,
    Position,
    TaxProfile,
    User,
)
from domain.portfolio.monthly_snapshot import (
    apply_transaction_to_position_state,
    generate_or_update_monthly_snapshot,
    get_monthly_evolution_series,
)
from routes.portfolio import _restore_history_payload, serialize_history_payload
from utils.brokerage_note_parser import guess_category
from utils.ticker_helper import extract_option_meta, resolve_ticker


@pytest.fixture
def mem_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    LocalSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    sess = LocalSession()
    try:
        sess.add_all([
            User(id=1, username="fabricio", password_hash="test_hash"),
            User(id=2, username="other", password_hash="test_hash"),
        ])
        sess.flush()
        yield sess
    finally:
        sess.close()
        engine.dispose()


class TestTickerAndCategoryParsers:
    def test_resolve_ticker_option_and_company_names(self):
        assert resolve_ticker("02/23 ABEVN139E ON 13,32") == "ABEVN139E"
        assert resolve_ticker("12/23 BHIAL700 ON 0,70 BHIA FM") == "BHIAL700"
        assert resolve_ticker("12/23 B3SAL131 ON 13,08 B3SA FM") == "B3SAL131"
        assert resolve_ticker("COPEL PNA N2") == "CPLE5"
        assert resolve_ticker("KLABIN S/A PN N2") == "KLBN4"
        assert resolve_ticker("ETF BV COIN CI ER") == "COIN11"
        assert resolve_ticker("GRUPO SOMA ON NM") == "SOMA3"
        assert resolve_ticker("CIA HERING ON NM") == "HGTX3"

    def test_extract_option_meta(self):
        put_meta = extract_option_meta("ABEVN139E")
        assert put_meta == {"underlying": "ABEV", "month": 2, "type": "PUT", "strike": 139.0}

        call_meta = extract_option_meta("B3SAL131")
        assert call_meta == {"underlying": "B3SA", "month": 12, "type": "CALL", "strike": 131.0}

        assert extract_option_meta("PETR4") is None

    def test_guess_category_mapping(self):
        assert guess_category("COIN11") == "Cripto"
        assert guess_category("ETHY11") == "Cripto"
        assert guess_category("VWRA11") == "Internacional"
        assert guess_category("B5P211") == "Renda Fixa"
        assert guess_category("ABEVN139E") == "Opções"
        assert guess_category("BHIAL700") == "Opções"
        assert guess_category("HGLG11") == "FII"
        assert guess_category("JBSS32") == "Ação"


class TestPositionReplayHelper:
    def test_replay_corporate_actions_and_trades(self):
        pos = {"quantity": Decimal("0"), "total_cost": Decimal("0")}
        apply_transaction_to_position_state(
            pos,
            SimpleNamespace(type="BUY", quantity=Decimal("10"), unit_price=Decimal("100"), total_value=Decimal("1000")),
        )
        assert pos["quantity"] == Decimal("10")
        assert pos["total_cost"] == Decimal("1000")

        # 10:1 split keeps cost, updates quantity to 100 and unit_price to 10
        apply_transaction_to_position_state(
            pos,
            SimpleNamespace(type="SPLIT", quantity=Decimal("100"), unit_price=Decimal("10"), total_value=Decimal("0")),
        )
        assert pos["quantity"] == Decimal("100")
        assert pos["total_cost"] == Decimal("1000")

        # Bonus preserves qty=110 with 0 extra cost
        apply_transaction_to_position_state(
            pos,
            SimpleNamespace(type="BONUS", quantity=Decimal("110"), unit_price=Decimal("0"), total_value=Decimal("0")),
        )
        assert pos["quantity"] == Decimal("110")
        assert pos["total_cost"] == Decimal("1000")

        # Amortization reduces cost basis
        apply_transaction_to_position_state(
            pos,
            SimpleNamespace(type="AMORTIZATION", quantity=Decimal("110"), unit_price=Decimal("1"), total_value=Decimal("110")),
        )
        assert pos["total_cost"] == Decimal("890")

        # Partial sell reduces quantity and cost proportionally
        apply_transaction_to_position_state(
            pos,
            SimpleNamespace(type="SELL", quantity=Decimal("55"), unit_price=Decimal("20"), total_value=Decimal("1100")),
        )
        assert pos["quantity"] == Decimal("55")
        assert pos["total_cost"] == Decimal("445")

        # Ticker change out closes old ticker; ticker change in opens new ticker
        apply_transaction_to_position_state(
            pos,
            SimpleNamespace(type="TICKER_CHANGE_OUT", quantity=Decimal("55"), unit_price=Decimal("8.09"), total_value=Decimal("445")),
        )
        assert pos["quantity"] == Decimal("0")
        assert pos["total_cost"] == Decimal("0")

        new_pos = {"quantity": Decimal("0"), "total_cost": Decimal("0")}
        apply_transaction_to_position_state(
            new_pos,
            SimpleNamespace(type="TICKER_CHANGE_IN", quantity=Decimal("55"), unit_price=Decimal("8.09"), total_value=Decimal("445")),
        )
        assert new_pos["quantity"] == Decimal("55")
        assert new_pos["total_cost"] == Decimal("445")

    def test_get_transaction_history_includes_delta_quantity_for_corporate_events(self, mem_session):
        from contextlib import contextmanager
        from services_modules.portfolio import PortfolioCrudService

        cat = Category(name="Ação", target_percent=Decimal("50"))
        mem_session.add(cat)
        mem_session.flush()
        asset = Asset(ticker="ROMI3", name="INDS ROMI", category_id=cat.id, currency="BRL")
        mem_session.add(asset)
        mem_session.flush()
        pos = Position(asset_id=asset.id, user_id=1, quantity=Decimal("66"), average_price=Decimal("5"))
        mem_session.add(pos)
        mem_session.flush()

        mem_session.add_all([
            AssetTransaction(
                position_id=pos.id, user_id=1, ticker="ROMI3", type="BUY",
                quantity=Decimal("30"), unit_price=Decimal("11"), total_value=Decimal("330"),
                transaction_date=datetime(2022, 1, 10, 12, 0),
            ),
            AssetTransaction(
                position_id=pos.id, user_id=1, ticker="ROMI3", type="BONUS",
                quantity=Decimal("33"), unit_price=Decimal("0"), total_value=Decimal("0"),
                transaction_date=datetime(2022, 4, 6, 12, 0),
            ),
            AssetTransaction(
                position_id=pos.id, user_id=1, ticker="ROMI3", type="SPLIT",
                quantity=Decimal("66"), unit_price=Decimal("5"), total_value=Decimal("0"),
                transaction_date=datetime(2023, 1, 5, 12, 0),
            ),
        ])
        mem_session.flush()

        @contextmanager
        def _fake_session():
            yield mem_session

        svc = PortfolioCrudService()
        svc.current_user_id = 1
        with patch("services_modules.portfolio.Session", return_value=_fake_session()):
            history = svc.get_transaction_history("ROMI3")

        assert [item["type"] for item in history] == ["SPLIT", "BONUS", "BUY"]
        assert history[0]["delta_quantity"] == pytest.approx(33.0)
        assert history[1]["delta_quantity"] == pytest.approx(3.0)
        assert "delta_quantity" not in history[2]


class TestHistoryBackupExportAndRestore:
    def test_round_trip_replace_merge_and_user_isolation(self, mem_session):
        cat_acao = Category(name="Ação", target_percent=Decimal("50"))
        cat_res = Category(name="Reserva", target_percent=Decimal("10"))
        mem_session.add_all([cat_acao, cat_res])
        mem_session.flush()

        asset_petr = Asset(ticker="PETR4", name="PETROBRAS", currency="BRL", category_id=cat_acao.id)
        asset_caix = Asset(ticker="Nubank Caixinha", name="Nubank Caixinha", currency="BRL", category_id=cat_res.id)
        asset_other = Asset(ticker="VALE3", name="VALE", currency="BRL", category_id=cat_acao.id)
        mem_session.add_all([asset_petr, asset_caix, asset_other])
        mem_session.flush()

        mem_session.add_all([
            MarketData(asset_id=asset_petr.id, date=date(2026, 11, 14), price=Decimal("36.50")),
            MarketData(asset_id=asset_caix.id, date=date(2026, 11, 14), price=Decimal("1000.00")),
        ])

        pos_u1 = Position(user_id=1, asset_id=asset_petr.id, quantity=Decimal("20"), average_price=Decimal("28.40"), target_percent=Decimal("8"))
        pos_caix = Position(user_id=1, asset_id=asset_caix.id, quantity=Decimal("1"), average_price=Decimal("1000.00"), target_percent=Decimal("100"))
        pos_u2 = Position(user_id=2, asset_id=asset_other.id, quantity=Decimal("99"), average_price=Decimal("60.00"), target_percent=Decimal("10"))
        mem_session.add_all([pos_u1, pos_caix, pos_u2])
        mem_session.flush()

        ce = CorporateEvent(
            user_id=1,
            asset_id=asset_petr.id,
            type="SPLIT",
            factor=Decimal("2"),
            date=date(2024, 5, 10),
            source="B3",
        )
        mem_session.add(ce)
        mem_session.flush()

        tx1 = AssetTransaction(
            position_id=pos_u1.id,
            user_id=1,
            ticker="PETR4",
            type="BUY",
            quantity=Decimal("10"),
            unit_price=Decimal("56.80"),
            total_value=Decimal("568.00"),
            transaction_date=datetime(2024, 1, 10, 12, 0),
        )
        tx2 = AssetTransaction(
            position_id=pos_u1.id,
            user_id=1,
            ticker="PETR4",
            type="SPLIT",
            quantity=Decimal("20"),
            unit_price=Decimal("28.40"),
            total_value=Decimal("0"),
            transaction_date=datetime(2024, 5, 10, 12, 0),
            corporate_event_id=ce.id,
        )
        tx_u2 = AssetTransaction(
            position_id=pos_u2.id,
            user_id=2,
            ticker="VALE3",
            type="BUY",
            quantity=Decimal("99"),
            unit_price=Decimal("60.00"),
            total_value=Decimal("5940.00"),
            transaction_date=datetime(2024, 1, 5, 12, 0),
        )
        mem_session.add_all([tx1, tx2, tx_u2])

        mem_session.add(
            Dividend(
                asset_id=asset_petr.id,
                user_id=1,
                date_com=date(2025, 4, 1),
                date_payment=date(2025, 4, 20),
                type="Dividendo",
                value_per_share=Decimal("1.50"),
                quantity_at_date=Decimal("20"),
                total_value=Decimal("30.00"),
                status="PAGO",
            )
        )
        mem_session.add(
            FixedIncome(
                asset_id=asset_caix.id,
                user_id=1,
                index_type="CDI",
                interest_rate=Decimal("100"),
                issue_date=datetime(2025, 1, 1),
                due_date=datetime(2027, 1, 1),
            )
        )
        mem_session.add(TaxProfile(user_id=1, accumulated_loss_stocks_st=Decimal("150.00")))
        mem_session.add(
            MonthlyPortfolioSnapshot(
                user_id=1,
                year=2025,
                month=4,
                total_invested_cost=Decimal("1568.00"),
                total_market_value=Decimal("1730.00"),
            )
        )
        mem_session.commit()

        exported = serialize_history_payload(mem_session, 1)
        assert exported["schema_version"] == "1.0"
        assert len(exported["positions"]) == 2
        assert len(exported["corporate_events"]) == 1
        assert len(exported["transactions"]) == 2
        assert exported["transactions"][1]["corporate_event_idx"] == 0
        assert len(exported["dividends"]) == 1
        assert len(exported["fixed_income"]) == 1
        assert exported["tax_profile"]["accumulated_loss_stocks_st"] == 150.0
        assert len(exported["monthly_snapshots"]) == 1

        # Replace mode wipes user 1 data and restores cleanly, leaving user 2 untouched and preserving mixed-case ticker
        mem_session.query(AssetTransaction).filter(AssetTransaction.user_id == 1).delete()
        mem_session.query(Position).filter(Position.user_id == 1).delete()
        mem_session.commit()

        counts_replace = _restore_history_payload(mem_session, 1, exported, mode="replace")
        mem_session.commit()
        assert counts_replace == {
            "positions": 2,
            "corporate_events": 1,
            "transactions": 2,
            "dividends": 1,
            "fixed_income": 1,
            "monthly_snapshots": 1,
        }
        # Confirm linked corporate_event_id and user 2 isolation
        restored_split = (
            mem_session.query(AssetTransaction)
            .filter(AssetTransaction.user_id == 1, AssetTransaction.type == "SPLIT")
            .one()
        )
        assert restored_split.corporate_event_id is not None
        assert mem_session.query(Position).filter(Position.user_id == 2).count() == 1
        assert mem_session.query(AssetTransaction).filter(AssetTransaction.user_id == 2).count() == 1
        assert mem_session.query(Asset).filter(Asset.ticker == "Nubank Caixinha").count() == 1

        # Merge mode should be idempotent (0 duplicate records added)
        counts_merge = _restore_history_payload(mem_session, 1, exported, mode="merge")
        mem_session.commit()
        assert counts_merge["corporate_events"] == 0
        assert counts_merge["transactions"] == 0
        assert counts_merge["dividends"] == 0
        assert counts_merge["fixed_income"] == 0
        assert counts_merge["monthly_snapshots"] == 0

    def test_import_history_endpoint_validation_errors(self):
        app.config["TESTING"] = True
        with patch("routes.auth.verify_session_token", return_value={"user_id": 1, "username": "teste"}):
            with app.test_client() as client:
                client.set_cookie("assetflow_session", "mock")
                resp_bad_mode = client.post(
                    "/api/portfolio/import-history",
                    json={"mode": "invalid", "data": {"positions": []}},
                )
                assert resp_bad_mode.status_code == 400

                resp_missing = client.post(
                    "/api/portfolio/import-history",
                    json={"mode": "replace", "positions": "not-a-list"},
                )
                assert resp_missing.status_code == 400


class TestMonthlySnapshotCalculation:
    @staticmethod
    def _create_asset_and_position(session, ticker: str, category_name: str):
        cat = session.query(Category).filter(Category.name == category_name).first()
        if not cat:
            cat = Category(name=category_name, target_percent=Decimal("0"))
            session.add(cat)
            session.flush()
        asset = Asset(ticker=ticker, name=ticker, category_id=cat.id)
        session.add(asset)
        session.flush()
        pos = Position(
            user_id=1,
            asset_id=asset.id,
            quantity=Decimal("0"),
            average_price=Decimal("0"),
        )
        session.add(pos)
        session.flush()
        return asset, pos

    @staticmethod
    def _add_tx(
        session,
        pos,
        ticker: str,
        tx_type: str,
        qty: str,
        unit_price: str,
        tx_dt: datetime,
        corporate_event_id: int | None = None,
    ):
        q = Decimal(qty)
        up = Decimal(unit_price)
        session.add(
            AssetTransaction(
                position_id=pos.id,
                user_id=1,
                ticker=ticker,
                type=tx_type,
                quantity=q,
                unit_price=up,
                total_value=(q * up).quantize(Decimal("0.01")),
                transaction_date=tx_dt,
                corporate_event_id=corporate_event_id,
            )
        )
        session.flush()

    def test_mid_month_buy_and_intra_month_exit_variation(self, mem_session):
        vale, pos_vale = self._create_asset_and_position(mem_session, "VALE3", "Ação")
        petr, pos_petr = self._create_asset_and_position(mem_session, "PETR4", "Ação")

        self._add_tx(mem_session, pos_vale, "VALE3", "BUY", "10", "60.00", datetime(2026, 3, 10, 12, 0))
        self._add_tx(mem_session, pos_petr, "PETR4", "BUY", "20", "30.00", datetime(2026, 3, 5, 12, 0))
        self._add_tx(mem_session, pos_petr, "PETR4", "SELL", "20", "27.00", datetime(2026, 3, 20, 12, 0))

        price_cache = {
            vale.id: {date(2026, 2, 28): 50.0, date(2026, 3, 31): 65.0},
            petr.id: {date(2026, 2, 28): 32.0, date(2026, 3, 31): 28.0},
        }
        generate_or_update_monthly_snapshot(mem_session, 1, 2026, 3, price_cache=price_cache)
        with patch("domain.portfolio.monthly_snapshot.build_historical_price_cache", return_value=price_cache):
            series = get_monthly_evolution_series(mem_session, 1)

        row = next(item for item in series if item["period"] == "03/2026")
        assert row["total_market_value"] == pytest.approx(650.0)
        assert row["month_variation"] == pytest.approx(-10.0)
        assert row["asset_performance"]["gainers"] == [{"ticker": "VALE3", "variation": 50.0}]
        assert row["asset_performance"]["losers"] == [{"ticker": "PETR4", "variation": -60.0}]

    def test_ticker_change_transfers_start_value_without_spurious_variation(self, mem_session):
        trpl, pos_trpl = self._create_asset_and_position(mem_session, "TRPL4", "Ação")
        isae, pos_isae = self._create_asset_and_position(mem_session, "ISAE4", "Ação")

        self._add_tx(mem_session, pos_trpl, "TRPL4", "BUY", "10", "20.00", datetime(2026, 1, 10, 12, 0))
        ce = CorporateEvent(
            asset_id=trpl.id,
            user_id=1,
            type="TICKER_CHANGE",
            new_ticker="ISAE4",
            date=date(2026, 2, 10),
        )
        mem_session.add(ce)
        mem_session.flush()
        self._add_tx(
            mem_session, pos_trpl, "TRPL4", "TICKER_CHANGE_OUT", "10", "20.00", datetime(2026, 2, 10, 12, 0), ce.id
        )
        self._add_tx(
            mem_session, pos_isae, "ISAE4", "TICKER_CHANGE_IN", "10", "20.00", datetime(2026, 2, 10, 12, 0), ce.id
        )

        price_cache = {
            trpl.id: {date(2026, 1, 31): 25.0},
            isae.id: {date(2026, 2, 28): 27.0},
        }
        generate_or_update_monthly_snapshot(mem_session, 1, 2026, 1, price_cache=price_cache)
        generate_or_update_monthly_snapshot(mem_session, 1, 2026, 2, price_cache=price_cache)
        with patch("domain.portfolio.monthly_snapshot.build_historical_price_cache", return_value=price_cache):
            series = get_monthly_evolution_series(mem_session, 1)

        feb = next(item for item in series if item["period"] == "02/2026")
        assert feb["total_market_value"] == pytest.approx(270.0)
        assert feb["month_variation"] == pytest.approx(20.0)
        assert feb["asset_performance"]["gainers"] == [{"ticker": "ISAE4", "variation": 20.0}]
        assert feb["asset_performance"]["losers"] == []

    def test_reserva_contributes_to_month_variation_and_excluded_from_gainers_losers(self, mem_session):
        caixinha, pos_caixinha = self._create_asset_and_position(mem_session, "Nubank Caixinha", "Reserva")
        itub, pos_itub = self._create_asset_and_position(mem_session, "ITUB3", "Ação")

        self._add_tx(mem_session, pos_caixinha, "Nubank Caixinha", "BUY", "100", "10.00", datetime(2026, 1, 5, 12, 0))
        self._add_tx(mem_session, pos_itub, "ITUB3", "BUY", "10", "30.00", datetime(2026, 1, 5, 12, 0))

        price_cache = {
            caixinha.id: {date(2026, 1, 31): 10.10, date(2026, 2, 28): 10.25},
            itub.id: {date(2026, 1, 31): 30.00, date(2026, 2, 28): 31.00},
        }
        generate_or_update_monthly_snapshot(mem_session, 1, 2026, 1, price_cache=price_cache)
        generate_or_update_monthly_snapshot(mem_session, 1, 2026, 2, price_cache=price_cache)
        with patch("domain.portfolio.monthly_snapshot.build_historical_price_cache", return_value=price_cache):
            series = get_monthly_evolution_series(mem_session, 1)

        feb = next(item for item in series if item["period"] == "02/2026")
        assert feb["total_market_value"] == pytest.approx(1335.0)
        assert feb["month_variation"] == pytest.approx(25.0)
        assert feb["asset_performance"]["gainers"] == [{"ticker": "ITUB3", "variation": 10.0}]
        assert feb["asset_performance"]["losers"] == []
