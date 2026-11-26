from datetime import date, datetime
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
    Debtor,
    Dividend,
    LoanInstallment,
    PaymentTransaction,
    Position,
    ReceivableLoan,
    RefundConfig,
    User,
)
from routes import calendar as cal_routes
from routes.refunds import loans as loans_routes
from routes.refunds import payments as pay_routes
from utils import dedup as dedup_mod
from utils.date_helper import get_due_date_helper, get_invoice_month_helper


@pytest.fixture
def cashflow_db(tmp_path, monkeypatch):
    db_file = tmp_path / "cashflow.db"
    engine = create_engine(f"sqlite:///{db_file}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    TestSession = scoped_session(sessionmaker(bind=engine))

    import db.session as db_session_mod

    monkeypatch.setattr(db_session_mod, "Session", TestSession)
    monkeypatch.setattr(dedup_mod, "Session", TestSession)
    monkeypatch.setattr(loans_routes, "Session", TestSession)
    monkeypatch.setattr(pay_routes, "Session", TestSession)

    with TestSession() as session:
        session.add_all([
            User(id=1, username="u1", password_hash=generate_password_hash("Pass123!")),
            Category(id=1, name="Ação", target_percent=Decimal("100")),
            RefundConfig(user_id=1, fechamento_dia=25, vencimento_dia=5),
        ])
        session.commit()

    yield TestSession
    TestSession.remove()
    engine.dispose()


def test_due_date_advances_month_when_due_day_less_than_closing_day():
    inv_month = get_invoice_month_helper(datetime(2026, 3, 26), closing_day=25)
    assert inv_month == "2026-04"
    # Vencimento dia 5 é menor que fechamento dia 25 -> vence no mês seguinte à fatura fechada
    due_dt = get_due_date_helper(inv_month, due_day=5, closing_day=25)
    assert due_dt.date() == date(2026, 5, 5)


def test_receivable_loan_cents_exact_on_last_installment(cashflow_db):
    from backend import app
    from flask import g

    with cashflow_db() as session:
        debtor = Debtor(id=1, user_id=1, nome="Carlos")
        session.add(debtor)
        session.commit()

    with app.test_request_context(
        "/api/refunds/loans",
        method="POST",
        json={
            "debtor_id": 1,
            "descricao": "Compra dividida",
            "categoria": "Geral",
            "valor_total": 100.00,
            "is_parcelado": True,
            "total_parcelas": 3,
            "data_emprestimo": "2026-03-10",
        },
    ):
        g.user_id = 1
        resp = loans_routes.handle_loans()
        data = resp.get_json() if hasattr(resp, "get_json") else resp[0].get_json()
        assert resp[1] == 201 if isinstance(resp, tuple) else resp.status_code == 201

    with cashflow_db() as session:
        insts = session.query(LoanInstallment).order_by(LoanInstallment.numero_parcela.asc()).all()
        assert len(insts) == 3
        vals = [Decimal(str(i.valor_parcela)) for i in insts]
        assert sum(vals) == Decimal("100.00")
        # Centavo residual vai para a última parcela: 33.33, 33.33, 33.34
        assert vals[-1] == Decimal("33.34")


def test_apply_payment_creates_transaction_without_integrity_error(cashflow_db):
    with cashflow_db() as session:
        d = Debtor(id=2, user_id=1, nome="Ana")
        session.add(d)
        session.flush()
        loan = ReceivableLoan(
            id=5, user_id=1, debtor_id=2, descricao="Notebook", categoria="Tech",
            data_emprestimo=datetime(2026, 1, 10), valor_total=Decimal("300.00"),
            is_parcelado=True, total_parcelas=2, fatura_mes="2026-02", status="PENDENTE",
        )
        session.add(loan)
        session.flush()
        inst1 = LoanInstallment(
            id=11, user_id=1, loan_id=5, numero_parcela=1,
            valor_parcela=Decimal("150.00"), data_vencimento=datetime(2026, 2, 5),
            fatura_mes="2026-02", status="ABERTA",
        )
        inst2 = LoanInstallment(
            id=12, user_id=1, loan_id=5, numero_parcela=2,
            valor_parcela=Decimal("150.00"), data_vencimento=datetime(2026, 3, 5),
            fatura_mes="2026-03", status="ABERTA",
        )
        session.add_all([inst1, inst2])
        session.commit()

        excess = pay_routes.apply_payment_to_installments(session, [inst1, inst2], Decimal("200.00"), "Pix")
        session.commit()

        assert excess == Decimal("0.0")
        ptxs = session.query(PaymentTransaction).all()
        assert len(ptxs) == 2
        assert all(p.installment_id is not None for p in ptxs)
        assert inst1.status == "PAGA"
        assert inst2.status == "ABERTA"


def test_dedup_hash_distinguishes_same_ticker_qty_different_date_and_price(cashflow_db):
    with cashflow_db() as session:
        asset = Asset(id=1, ticker="PETR4", category_id=1)
        session.add(asset)
        session.flush()
        pos = Position(id=1, user_id=1, asset_id=1, quantity=Decimal("200"), average_price=Decimal("31"))
        session.add(pos)
        session.flush()
        session.add(
            AssetTransaction(
                user_id=1, position_id=1, ticker="PETR4", type="BUY", quantity=Decimal("100"),
                unit_price=Decimal("30.00"), total_value=Decimal("3000.00"),
                transaction_date=datetime(2026, 1, 10),
            )
        )
        session.commit()

    parsed = [
        {"ticker": "PETR4", "date": "2026-01-10", "type": "BUY", "quantity": 100, "unit_price": 30.0, "total_value": 3000.0},
        {"ticker": "PETR4", "date": "2026-02-10", "type": "BUY", "quantity": 100, "unit_price": 32.0, "total_value": 3200.0},
    ]
    out = dedup_mod.match_b3_to_db(1, {"transactions": parsed, "dividends": []})
    assert out["transactions"][0]["db_matched"] is True
    assert out["transactions"][1]["db_matched"] is False


def test_calendar_does_not_fabricate_payment_date_or_paid_for_undefined():
    div_row = Dividend(
        id=99, user_id=1, asset_id=1,
        date_com=date(2025, 1, 10),
        date_payment=None,
        type="Dividendo",
        value_per_share=Decimal("0.50"),
        quantity_at_date=Decimal("100"),
        total_value=Decimal("50.00"),
        status="PROVISIONADO",
    )
    div_row.asset = Asset(id=1, ticker="BBSE3", category_id=1)
    serialized = cal_routes._serialize_db_dividend_event(div_row, {1: 100.0}, date(2026, 5, 1))
    assert serialized["date_payment"] is None
    assert serialized["status"] == "PROVISIONADO"
    assert serialized["is_estimate"] is True
