from datetime import date
from unittest.mock import patch
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from db.models import Asset, Base, Category, Dividend, Position, User
from services_modules.dashboard import DashboardService


def test_dashboard_computes_dividendos_recebidos_and_pm_ajustado():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)

    class _CtxSession:
        def __init__(self):
            self.db = SessionLocal()

        def __enter__(self):
            return self.db

        def __exit__(self, exc_type, exc_val, exc_tb):
            self.db.close()

    with SessionLocal() as db:
        user = User(username="fabricio", password_hash="x")
        cat = Category(name="Ação", target_percent=50.0)
        a_with_div = Asset(ticker="BBDC4", name="Bradesco", category=cat, currency="BRL")
        a_no_div = Asset(ticker="WEGE3", name="WEG", category=cat, currency="BRL")
        db.add_all([user, cat, a_with_div, a_no_div])
        db.flush()

        db.add_all([
            Position(user_id=user.id, asset_id=a_with_div.id, quantity=100, average_price=15.0, target_percent=50.0),
            Position(user_id=user.id, asset_id=a_no_div.id, quantity=10, average_price=40.0, target_percent=50.0),
            Dividend(
                asset_id=a_with_div.id,
                user_id=user.id,
                date_com=date(2026, 10, 1),
                date_payment=date(2026, 10, 15),
                type="Dividendo",
                value_per_share=1.0,
                quantity_at_date=100,
                total_value=100.0,
                status="PAGO",
            ),
            Dividend(
                asset_id=a_with_div.id,
                user_id=user.id,
                date_com=date(2026, 11, 1),
                date_payment=date(2026, 12, 1),
                type="Dividendo",
                value_per_share=0.5,
                quantity_at_date=100,
                total_value=50.0,
                status="A RECEBER",
            ),
        ])
        db.commit()
        uid = user.id

    svc = DashboardService()
    svc.current_user_id = uid
    svc.get_usd_rate = lambda: 5.0

    with patch("services_modules.dashboard.Session", _CtxSession):
        result = svc.get_dashboard_data()

    by_ticker = {item["ticker"]: item for item in result["ativos"]}
    assert by_ticker["BBDC4"]["dividendos_recebidos"] == 100.0
    assert by_ticker["BBDC4"]["pm_ajustado_dividendos"] == 14.0
    assert by_ticker["BBDC4"]["total_return_valor"] == 100.0
    assert by_ticker["BBDC4"]["total_return_pct"] == (100.0 / 1500.0) * 100.0
    assert by_ticker["WEGE3"]["dividendos_recebidos"] == 0.0
    assert by_ticker["WEGE3"]["pm_ajustado_dividendos"] is None
    assert result["resumo"]["TotalDividendos"] == 100.0
    assert result["resumo"]["TotalReturnValor"] == 100.0
