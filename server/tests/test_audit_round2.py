from datetime import date, datetime
from decimal import Decimal
import json
import sqlite3

import pytest
from flask import g
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import scoped_session, sessionmaker
from werkzeug.exceptions import Unauthorized
from werkzeug.security import generate_password_hash

from backend import app
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
from routes import auth as auth_module
from services import PortfolioService
from services_modules import backup as backup_module
from services_modules import portfolio as portfolio_module
from utils import dedup as dedup_module
from utils.db_utils import get_current_user_id


@pytest.fixture
def isolated_db(tmp_path, monkeypatch):
    db_file = tmp_path / "audit_round2.db"
    engine = create_engine(
        f"sqlite:///{db_file}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine)
    TestSession = scoped_session(session_factory)

    import db.session as db_session_module

    monkeypatch.setattr(db_session_module, "Session", TestSession)
    monkeypatch.setattr(portfolio_module, "Session", TestSession)
    monkeypatch.setattr(backup_module, "Session", TestSession)
    monkeypatch.setattr(auth_module, "Session", TestSession)
    monkeypatch.setattr(dedup_module, "Session", TestSession)

    with TestSession() as session:
        session.add_all([
            User(id=1, username="user1", password_hash=generate_password_hash("User1Pass!")),
            User(id=2, username="user2", password_hash=generate_password_hash("User2Pass!")),
            Category(id=1, name="Ação", target_percent=Decimal("100")),
        ])
        session.commit()

    yield TestSession, tmp_path

    TestSession.remove()
    engine.dispose()


def _create_asset_and_position(TestSession, ticker="PETR4", user_id=1, qty="0", pm="0"):
    with TestSession() as session:
        asset = Asset(ticker=ticker, name=ticker, category_id=1, currency="BRL")
        session.add(asset)
        session.flush()
        pos = Position(
            asset_id=asset.id,
            user_id=user_id,
            quantity=Decimal(qty),
            average_price=Decimal(pm),
            target_percent=Decimal("10"),
        )
        session.add(pos)
        session.commit()
        return asset.id, pos.id


def test_d1_delete_transaction_replays_corporate_actions_and_ticker_change_in(isolated_db):
    TestSession, _ = isolated_db
    _, pos_id = _create_asset_and_position(TestSession, ticker="VALE3")

    with TestSession() as session:
        tx_in = AssetTransaction(
            position_id=pos_id,
            user_id=1,
            ticker="VALE3",
            type="TICKER_CHANGE_IN",
            quantity=Decimal("100"),
            unit_price=Decimal("15"),
            total_value=Decimal("1500"),
            transaction_date=datetime(2025, 1, 10),
        )
        tx_buy1 = AssetTransaction(
            position_id=pos_id,
            user_id=1,
            ticker="VALE3",
            type="BUY",
            quantity=Decimal("10"),
            unit_price=Decimal("20"),
            total_value=Decimal("200"),
            transaction_date=datetime(2025, 2, 10),
        )
        tx_split = AssetTransaction(
            position_id=pos_id,
            user_id=1,
            ticker="VALE3",
            type="SPLIT",
            quantity=Decimal("220"),
            unit_price=Decimal("7.7273"),
            total_value=Decimal("0"),
            transaction_date=datetime(2025, 3, 10),
        )
        tx_extra = AssetTransaction(
            position_id=pos_id,
            user_id=1,
            ticker="VALE3",
            type="BUY",
            quantity=Decimal("5"),
            unit_price=Decimal("8"),
            total_value=Decimal("40"),
            transaction_date=datetime(2025, 4, 10),
        )
        session.add_all([tx_in, tx_buy1, tx_split, tx_extra])
        session.commit()
        extra_id = tx_extra.id

    srv = PortfolioService()
    srv.current_user_id = 1
    assert srv.delete_transaction(extra_id) is True

    with TestSession() as session:
        pos = session.query(Position).filter_by(id=pos_id).first()
        assert pos.quantity == Decimal("220")
        assert pos.average_price == Decimal("7.7273")


def test_d2_and_d5_update_position_creates_adjustment_ledger_and_preserves_min_6m(isolated_db):
    TestSession, _ = isolated_db
    asset_id, pos_id = _create_asset_and_position(
        TestSession, ticker="ITUB4", qty="10", pm="30"
    )

    with TestSession() as session:
        session.add(
            MarketData(
                asset_id=asset_id,
                date=date.today(),
                price=Decimal("32.0"),
                min_6m=Decimal("25.50"),
            )
        )
        session.commit()

    srv = PortfolioService()
    srv.current_user_id = 1
    srv.update_position("ITUB4", qtd=50, pm=31.0, meta=15, current_price=35.0)

    with TestSession() as session:
        adj_txs = (
            session.query(AssetTransaction)
            .filter_by(position_id=pos_id, type="ADJUSTMENT")
            .all()
        )
        assert len(adj_txs) == 1
        assert adj_txs[0].quantity == Decimal("50")
        assert adj_txs[0].unit_price == Decimal("31")
        assert adj_txs[0].total_value == Decimal("1550")

        mdata = session.query(MarketData).filter_by(asset_id=asset_id).first()
        assert mdata.price == Decimal("35")
        assert mdata.min_6m == Decimal("25.5")


def test_d3_backup_database_preserves_uncheckpointed_wal_rows(isolated_db, monkeypatch):
    _, tmp_path = isolated_db
    src_db = tmp_path / "wal_src.db"
    backup_dir = tmp_path / "backups"

    reader_conn = None
    writer_conn = sqlite3.connect(src_db)
    try:
        writer_conn.execute("PRAGMA journal_mode=WAL")
        writer_conn.execute("CREATE TABLE wal_items (id INTEGER PRIMARY KEY, note TEXT)")
        writer_conn.execute("INSERT INTO wal_items (id, note) VALUES (1, 'base')")
        writer_conn.commit()

        # Hold a read lock so the second commit remains only in the WAL file
        reader_conn = sqlite3.connect(src_db)
        reader_conn.execute("BEGIN")
        reader_conn.execute("SELECT * FROM wal_items").fetchall()

        writer_conn.execute("INSERT INTO wal_items (id, note) VALUES (2, 'in-wal')")
        writer_conn.commit()

        monkeypatch.setenv("DATABASE_PATH", str(src_db))
        monkeypatch.setenv("BACKUP_DIR", str(backup_dir))

        srv = PortfolioService()
        srv._backup_database()
    finally:
        if reader_conn is not None:
            reader_conn.close()
        writer_conn.close()

    dest = backup_dir / f"assetflow_backup_{date.today()}.db"
    assert dest.exists()
    with sqlite3.connect(dest) as verify_conn:
        integrity = verify_conn.execute("PRAGMA integrity_check").fetchone()[0]
        rows = verify_conn.execute("SELECT id, note FROM wal_items ORDER BY id").fetchall()
    assert integrity == "ok"
    assert rows == [(1, "base"), (2, "in-wal")]


def test_d4_portfolio_snapshot_rejects_duplicate_user_date(isolated_db):
    TestSession, _ = isolated_db
    today = date.today()
    with TestSession() as session:
        session.add(
            PortfolioSnapshot(
                user_id=1,
                date=today,
                total_equity=Decimal("1000"),
                total_invested=Decimal("900"),
                profit=Decimal("100"),
            )
        )
        session.commit()

    with TestSession() as session:
        session.add(
            PortfolioSnapshot(
                user_id=1,
                date=today,
                total_equity=Decimal("1100"),
                total_invested=Decimal("900"),
                profit=Decimal("200"),
            )
        )
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()


def test_s1_pwd_sig_invalidates_token_after_password_change(isolated_db):
    TestSession, _ = isolated_db
    old_secret = app.config.get("SECRET_KEY")
    app.config["SECRET_KEY"] = "test-secret-round2"
    try:
        with app.app_context():
            with TestSession() as session:
                user = session.query(User).filter_by(id=1).first()
                old_sig = (user.password_hash or "")[-16:]

            token = auth_module.generate_session_token(1, "user1", pwd_sig=old_sig)
            payload = auth_module.verify_session_token(token)
            assert payload is not None
            assert payload["user_id"] == 1

            with TestSession() as session:
                user = session.query(User).filter_by(id=1).first()
                user.password_hash = generate_password_hash("BrandNewPass99!")
                session.commit()

            assert auth_module.verify_session_token(token) is None
    finally:
        if old_secret is None:
            app.config.pop("SECRET_KEY", None)
        else:
            app.config["SECRET_KEY"] = old_secret


def test_s2_login_rate_limit_counts_failures_only_and_uses_xff(isolated_db):
    TestSession, _ = isolated_db
    old_testing = app.config.get("TESTING")
    old_secret = app.config.get("SECRET_KEY")
    app.config["TESTING"] = False
    app.config["SECRET_KEY"] = "test-secret-round2"
    auth_module._rate_limit_store.clear()

    try:
        client = app.test_client()
        for _ in range(6):
            res = client.post(
                "/api/auth/login",
                json={"username": "user1", "password": "User1Pass!"},
                headers={"X-Forwarded-For": "203.0.113.10"},
            )
            assert res.status_code == 200

        with TestSession() as session:
            assert (
                session.query(SystemCache)
                .filter_by(key="rate_limit:203.0.113.10")
                .first()
                is None
            )

        for _ in range(5):
            res = client.post(
                "/api/auth/login",
                json={"username": "user1", "password": "WrongPassword!"},
                headers={"X-Forwarded-For": "203.0.113.99, 10.0.0.1"},
            )
            assert res.status_code == 401

        blocked = client.post(
            "/api/auth/login",
            json={"username": "user1", "password": "User1Pass!"},
            headers={"X-Forwarded-For": "203.0.113.99"},
        )
        assert blocked.status_code == 429

        with TestSession() as session:
            entry = (
                session.query(SystemCache)
                .filter_by(key="rate_limit:203.0.113.99")
                .first()
            )
            assert entry is not None
            assert len(json.loads(entry.value)) == 5
    finally:
        app.config["TESTING"] = old_testing
        if old_secret is None:
            app.config.pop("SECRET_KEY", None)
        else:
            app.config["SECRET_KEY"] = old_secret


def test_s3_get_current_user_id_raises_unauthorized_without_session():
    old_testing = app.config.get("TESTING")
    app.config["TESTING"] = False
    try:
        with app.test_request_context("/api/portfolio"):
            with pytest.raises(Unauthorized):
                get_current_user_id()
    finally:
        app.config["TESTING"] = old_testing


def test_c4_before_flush_user_scoping_stamps_missing_user_id(isolated_db):
    TestSession, _ = isolated_db
    with app.test_request_context("/api/portfolio"):
        g.user_id = 2
        with TestSession() as session:
            snap = PortfolioSnapshot(
                date=date.today(),
                total_equity=Decimal("500"),
                total_invested=Decimal("400"),
                profit=Decimal("100"),
            )
            session.add(snap)
            session.flush()
            assert snap.user_id == 2
            session.rollback()


def test_c5_match_b3_to_db_scopes_duplicates_by_user(isolated_db):
    TestSession, _ = isolated_db
    asset_id, pos_id = _create_asset_and_position(TestSession, ticker="BBAS3", user_id=1)

    with TestSession() as session:
        session.add(
            Dividend(
                asset_id=asset_id,
                user_id=1,
                date_com=date(2025, 5, 2),
                date_payment=date(2025, 5, 15),
                type="Dividendo",
                value_per_share=Decimal("1.50"),
                quantity_at_date=Decimal("100"),
                total_value=Decimal("150.00"),
            )
        )
        session.add(
            AssetTransaction(
                position_id=pos_id,
                user_id=1,
                ticker="BBAS3",
                type="BUY",
                quantity=Decimal("100"),
                unit_price=Decimal("25"),
                total_value=Decimal("2500"),
                transaction_date=datetime(2025, 5, 1, 10, 0),
            )
        )
        session.add(
            CorporateEvent(
                asset_id=asset_id,
                user_id=1,
                type="SPLIT",
                factor=Decimal("2"),
                date=date(2025, 6, 1),
            )
        )
        session.commit()

    payload_user1 = {
        "dividends": [
            {"ticker": "BBAS3", "total_value": 150.0},
            {"ticker": "BBAS3", "total_value": 999.0},
        ],
        "transactions": [
            {"ticker": "BBAS3", "date": "2025-05-01", "quantity": 100.0},
            {"ticker": "BBAS3", "date": "2025-05-02", "quantity": 100.0},
        ],
        "corporate_events_suggestions": [
            {"ticker": "BBAS3", "date": "2025-06-01"},
            {"ticker": "BBAS3", "date": "2025-07-01"},
        ],
    }

    res1 = dedup_module.match_b3_to_db(1, payload_user1)
    assert res1["dividends"][0]["db_matched"] is True
    assert res1["dividends"][1]["db_matched"] is False
    assert res1["transactions"][0]["db_matched"] is True
    assert res1["transactions"][1]["db_matched"] is False
    assert res1["corporate_events_suggestions"][0]["db_matched"] is True
    assert res1["corporate_events_suggestions"][1]["db_matched"] is False

    payload_user2 = {
        "dividends": [{"ticker": "BBAS3", "total_value": 150.0}],
        "transactions": [{"ticker": "BBAS3", "date": "2025-05-01", "quantity": 100.0}],
        "corporate_events_suggestions": [{"ticker": "BBAS3", "date": "2025-06-01"}],
    }
    res2 = dedup_module.match_b3_to_db(2, payload_user2)
    assert res2["dividends"][0]["db_matched"] is False
    assert res2["transactions"][0]["db_matched"] is False
    assert res2["corporate_events_suggestions"][0]["db_matched"] is False
