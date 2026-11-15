import pytest
from unittest.mock import patch, MagicMock
from decimal import Decimal
from datetime import date, datetime

from domain.tax.tax_engine import calculate_monthly_darf, _detect_day_trades

@patch('db.session.Session')
def test_calculate_monthly_darf_exempt_swing_trade(mock_session_cls):
    mock_session = MagicMock()
    mock_session_cls.return_value = mock_session
    mock_session.__enter__.return_value = mock_session
    
    mock_profile = MagicMock(
        accumulated_loss_stocks_st=Decimal("0.0"),
        accumulated_loss_stocks_dt=Decimal("0.0"),
        accumulated_loss_fiis=Decimal("0.0"),
        accumulated_darf_balance=Decimal("0.0")
    )
    
    tx = MagicMock()
    tx.id = 1
    tx.ticker = "PETR4"
    tx.transaction_date = datetime(2026, 8, 10)
    tx.total_value = Decimal("15000.0")
    tx.cost_basis = Decimal("10.0")
    tx.quantity = Decimal("1000")
    tx.type = "SELL"
    tx.is_day_trade = False
    
    asset = MagicMock(ticker="PETR4")
    category = MagicMock(name="AÃ§Ã£o")
    
    mock_query = MagicMock()
    mock_session.query.return_value = mock_query
    mock_query.filter_by.return_value.first.return_value = mock_profile
    mock_query.filter.return_value.distinct.return_value.all.return_value = []
    mock_query.filter.return_value.all.return_value = []
    mock_query.join.return_value.join.return_value.filter.return_value.all.return_value = [(tx, asset, category)]
    
    res = calculate_monthly_darf(1, 8, 2026)
    
    assert res['sales_total_stocks'] == 15000.0
    assert res['is_exempt_stocks_st'] is True
    assert res['profits']['stocks_st'] == 5000.0
    assert res['taxable_profits']['stocks_st'] == 0.0
    assert res['taxes']['stocks_st'] == 0.0
    assert res['darf']['darf_to_pay'] == 0.0

@patch('db.session.Session')
def test_calculate_monthly_darf_taxable_fii(mock_session_cls):
    mock_session = MagicMock()
    mock_session_cls.return_value = mock_session
    mock_session.__enter__.return_value = mock_session
    
    mock_profile = MagicMock(
        accumulated_loss_stocks_st=Decimal("0.0"),
        accumulated_loss_stocks_dt=Decimal("0.0"),
        accumulated_loss_fiis=Decimal("0.0"),
        accumulated_darf_balance=Decimal("0.0")
    )
    
    tx = MagicMock()
    tx.id = 2
    tx.ticker = "MXRF11"
    tx.transaction_date = datetime(2026, 8, 15)
    tx.total_value = Decimal("2000.0")
    tx.cost_basis = Decimal("10.0")
    tx.quantity = Decimal("100")
    tx.type = "SELL"
    tx.is_day_trade = False
    
    asset = MagicMock(ticker="MXRF11")
    category = MagicMock()
    category.name = "FII"
    
    mock_query = MagicMock()
    mock_session.query.return_value = mock_query
    mock_query.filter_by.return_value.first.return_value = mock_profile
    mock_query.filter.return_value.distinct.return_value.all.return_value = []
    mock_query.filter.return_value.all.return_value = []
    mock_query.join.return_value.join.return_value.filter.return_value.all.return_value = [(tx, asset, category)]
    
    res = calculate_monthly_darf(1, 8, 2026)
    
    assert res['profits']['fiis'] == 1000.0
    assert res['taxable_profits']['fiis'] == 1000.0
    assert res['taxes']['fiis'] == 200.0
    assert res['darf']['darf_to_pay'] == 200.0

@patch('db.session.Session')
def test_calculate_monthly_darf_loss_offsetting(mock_session_cls):
    mock_session = MagicMock()
    mock_session_cls.return_value = mock_session
    mock_session.__enter__.return_value = mock_session
    
    mock_profile = MagicMock(
        accumulated_loss_stocks_st=Decimal("1000.0"),
        accumulated_loss_stocks_dt=Decimal("0.0"),
        accumulated_loss_fiis=Decimal("0.0"),
        accumulated_darf_balance=Decimal("0.0")
    )
    
    tx = MagicMock()
    tx.id = 3
    tx.ticker = "VALE3"
    tx.transaction_date = datetime(2026, 8, 20)
    tx.total_value = Decimal("25000.0")
    tx.cost_basis = Decimal("23.0")
    tx.quantity = Decimal("1000")
    tx.type = "SELL"
    tx.is_day_trade = False
    
    asset = MagicMock(ticker="VALE3")
    category = MagicMock(name="AÃ§Ã£o")
    
    mock_query = MagicMock()
    mock_session.query.return_value = mock_query
    mock_query.filter_by.return_value.first.return_value = mock_profile
    mock_query.filter.return_value.distinct.return_value.all.return_value = []
    mock_query.filter.return_value.all.return_value = []
    mock_query.join.return_value.join.return_value.filter.return_value.all.return_value = [(tx, asset, category)]
    
    res = calculate_monthly_darf(1, 8, 2026)
    
    assert res['sales_total_stocks'] == 25000.0
    assert res['is_exempt_stocks_st'] is False
    assert res['profits']['stocks_st'] == 2000.0
    assert res['taxable_profits']['stocks_st'] == 1000.0
    assert res['taxes']['stocks_st'] == 150.0
    assert res['accumulated_losses']['stocks_st'] == 0.0

@patch('db.session.Session')
def test_calculate_monthly_darf_accumulates_under_10(mock_session_cls):
    mock_session = MagicMock()
    mock_session_cls.return_value = mock_session
    mock_session.__enter__.return_value = mock_session
    
    mock_profile = MagicMock(
        accumulated_loss_stocks_st=Decimal("0.0"),
        accumulated_loss_stocks_dt=Decimal("0.0"),
        accumulated_loss_fiis=Decimal("0.0"),
        accumulated_darf_balance=Decimal("0.0")
    )
    
    tx = MagicMock()
    tx.id = 4
    tx.ticker = "MXRF11"
    tx.transaction_date = datetime(2026, 8, 25)
    tx.total_value = Decimal("200.0")
    tx.cost_basis = Decimal("1.6")
    tx.quantity = Decimal("100")
    tx.type = "SELL"
    tx.is_day_trade = False
    
    asset = MagicMock(ticker="MXRF11")
    category = MagicMock()
    category.name = "FII"
    
    mock_query = MagicMock()
    mock_session.query.return_value = mock_query
    mock_query.filter_by.return_value.first.return_value = mock_profile
    mock_query.filter.return_value.distinct.return_value.all.return_value = []
    mock_query.filter.return_value.all.return_value = []
    mock_query.join.return_value.join.return_value.filter.return_value.all.return_value = [(tx, asset, category)]
    
    res = calculate_monthly_darf(1, 8, 2026)
    
    assert res['profits']['fiis'] == 40.0
    assert res['taxes']['fiis'] == 8.0
    assert res['darf']['month_tax'] == 8.0
    assert res['darf']['darf_to_pay'] == 0.0
    assert res['darf']['next_month_accumulated'] == 8.0


def test_bens_e_direitos_handles_corporate_events_and_same_day_sell_buy():
    from datetime import datetime
    from decimal import Decimal
    from unittest.mock import MagicMock
    from domain.tax.annual_irpf import _get_bens_e_direitos

    def _tx(tx_id, ticker, tx_type, qty, total, dt, cat_name="Ação"):
        tx = MagicMock()
        tx.id = tx_id
        tx.ticker = ticker
        tx.type = tx_type
        tx.quantity = Decimal(str(qty))
        tx.total_value = Decimal(str(total))
        tx.transaction_date = dt
        asset = MagicMock()
        asset.name = ticker
        asset.cnpj = "00.000.000/0001-00"
        cat = MagicMock()
        cat.name = cat_name
        return (tx, asset, cat)

    rows = [
        # Same-day SELL recorded before BUY (should net to 0)
        _tx(1, "ABEV3", "BUY", 20, 200, datetime(2023, 1, 10)),
        _tx(2, "ABEV3", "SELL", 100, 1000, datetime(2023, 3, 2)),
        _tx(3, "ABEV3", "BUY", 100, 1000, datetime(2023, 3, 2)),
        _tx(4, "ABEV3", "SELL", 20, 200, datetime(2023, 12, 26)),
        # Ticker change TRPL4 -> ISAE4
        _tx(5, "TRPL4", "BUY", 10, 250, datetime(2023, 5, 1)),
        _tx(6, "TRPL4", "TICKER_CHANGE_OUT", 10, 250, datetime(2024, 11, 19)),
        _tx(7, "ISAE4", "TICKER_CHANGE_IN", 10, 250, datetime(2024, 11, 19)),
        # Split + Amortization on FII
        _tx(8, "GGRC11", "BUY", 5, 500, datetime(2023, 6, 1), "FII"),
        _tx(9, "GGRC11", "SPLIT", 50, 0, datetime(2024, 3, 7), "FII"),
        _tx(10, "GGRC11", "AMORTIZATION", 50, 25, datetime(2025, 1, 10), "FII"),
    ]

    session = MagicMock()
    session.query.return_value.join.return_value.join.return_value.filter.return_value.order_by.return_value.all.return_value = rows

    bens = _get_bens_e_direitos(session, user_id=1, year=2025)
    by_ticker = {b["ticker"]: b for b in bens}

    assert "ABEV3" not in by_ticker
    assert "TRPL4" not in by_ticker
    assert by_ticker["ISAE4"]["quantity"] == 10.0
    assert by_ticker["ISAE4"]["total_cost"] == 250.0
    assert by_ticker["GGRC11"]["quantity"] == 50.0
    assert by_ticker["GGRC11"]["total_cost"] == 475.0
    assert "cotas de GGRC11" in by_ticker["GGRC11"]["description"]
