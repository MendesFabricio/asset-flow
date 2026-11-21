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


@patch('db.session.Session')
def test_calculate_monthly_darf_ignores_zero_value_stock_writeoff_but_keeps_option_dust(mock_session_cls):
    mock_session = MagicMock()
    mock_session_cls.return_value = mock_session
    mock_session.__enter__.return_value = mock_session

    mock_profile = MagicMock(
        accumulated_loss_stocks_st=Decimal("0.0"),
        accumulated_loss_stocks_dt=Decimal("0.0"),
        accumulated_loss_fiis=Decimal("0.0"),
        accumulated_darf_balance=Decimal("0.0"),
    )

    tx_stock_zero = MagicMock(
        id=926, ticker="VIVR3", transaction_date=datetime(2026, 1, 5),
        total_value=Decimal("0.0"), cost_basis=Decimal("12.40"),
        quantity=Decimal("120"), type="SELL", is_day_trade=False, is_option=False,
    )
    tx_option_zero = MagicMock(
        id=932, ticker="BHIAL700", transaction_date=datetime(2026, 1, 15),
        total_value=Decimal("0.0"), cost_basis=Decimal("0.50"),
        quantity=Decimal("100"), type="SELL", is_day_trade=False, is_option=True,
    )

    mock_query = MagicMock()
    mock_session.query.return_value = mock_query
    mock_query.filter_by.return_value.first.return_value = mock_profile
    mock_query.filter.return_value.distinct.return_value.all.return_value = []
    mock_query.filter.return_value.all.return_value = []
    mock_query.join.return_value.join.return_value.filter.return_value.all.return_value = [
        (tx_stock_zero, MagicMock(ticker="VIVR3"), MagicMock(name="Ação")),
        (tx_option_zero, MagicMock(ticker="BHIAL700"), MagicMock(name="Opções")),
    ]

    res = calculate_monthly_darf(1, 1, 2026)

    # VIVR3 a R$ 0 não gera prejuízo fantasma; apenas a opção que virou pó (-50,00) entra no cálculo
    assert res["profits"]["stocks_st"] == -50.0
    assert len(res["details"]) == 1
    assert res["details"][0]["ticker"] == "BHIAL700"


@patch('domain.tax.tax_engine._detect_day_trades')
@patch('domain.tax.tax_engine.get_or_create_tax_profile')
@patch('domain.tax.annual_irpf.Session')
def test_calculate_annual_irpf_separates_jcp_and_reserva_deposit(
    mock_session_cls, mock_profile, _mock_dt
):
    from domain.tax.annual_irpf import calculate_annual_irpf, _get_bens_e_direitos

    mock_session = MagicMock()
    mock_session_cls.return_value = mock_session
    mock_session.__enter__.return_value = mock_session
    mock_profile.return_value = MagicMock(
        accumulated_loss_stocks_st=Decimal("0.0"),
        accumulated_loss_stocks_dt=Decimal("0.0"),
        accumulated_loss_fiis=Decimal("0.0"),
    )

    div_ok = MagicMock(type="Dividendo", total_value=Decimal("100.0"))
    jcp_ok = MagicMock(type="Juros Sobre Capital Próprio", total_value=Decimal("45.0"))
    amort = MagicMock(type="AMORTIZATION", total_value=Decimal("30.0"))
    mock_session.query.return_value.filter.return_value.all.return_value = [div_ok, jcp_ok, amort]
    mock_session.query.return_value.join.return_value.join.return_value.filter.return_value.all.return_value = []

    with patch('domain.tax.annual_irpf._get_bens_e_direitos', return_value=[]):
        res = calculate_annual_irpf(user_id=1, year=2025)
    assert res["rendimentos_isentos"]["dividendos"] == pytest.approx(100.0)
    assert res["rendimentos_exclusivos"]["jcp"] == pytest.approx(45.0)

    # _get_bens_e_direitos handles DEPOSIT/WITHDRAW and live Reserva balance
    tx_buy = MagicMock(id=1, ticker="NUBANK TURBO", type="BUY", quantity=Decimal("1"), total_value=Decimal("9000"), transaction_date=datetime(2026, 1, 2))
    tx_dep = MagicMock(id=2, ticker="NUBANK TURBO", type="DEPOSIT", quantity=Decimal("1"), total_value=Decimal("559.75"), transaction_date=datetime(2026, 5, 2))
    a_turbo = MagicMock(cnpj="00")
    a_turbo.name = "Nubank Turbo"
    c_res = MagicMock()
    c_res.name = "Reserva"

    pos_sess = MagicMock()
    pos_sess.query.return_value.join.return_value.join.return_value.filter.return_value.order_by.return_value.all.return_value = [
        (tx_buy, a_turbo, c_res),
        (tx_dep, a_turbo, c_res),
    ]
    pos_live = MagicMock(quantity=Decimal("1"), average_price=Decimal("9600.0"))
    a_live = MagicMock(ticker="NUBANK TURBO", cnpj="00")
    a_live.name = "Nubank Turbo"
    pos_sess.query.return_value.join.return_value.join.return_value.filter.return_value.all.return_value = [
        (pos_live, a_live, c_res)
    ]
    bens = _get_bens_e_direitos(pos_sess, user_id=1, year=date.today().year)
    assert len(bens) == 1
    assert bens[0]["total_cost"] == pytest.approx(9600.0)


@patch('domain.tax.annual_irpf._get_bens_e_direitos', return_value=[])
@patch('domain.tax.tax_engine._detect_day_trades')
@patch('domain.tax.tax_engine.get_or_create_tax_profile')
@patch('domain.tax.annual_irpf.Session')
@patch('db.session.Session')
def test_etf_and_options_swing_trade_not_exempt_under_20k(
    mock_tax_sess_cls, mock_irpf_sess_cls, mock_profile, _mock_dt, _mock_bens
):
    from domain.tax.annual_irpf import calculate_annual_irpf

    profile = MagicMock(
        accumulated_loss_stocks_st=Decimal("0.0"),
        accumulated_loss_stocks_dt=Decimal("0.0"),
        accumulated_loss_fiis=Decimal("0.0"),
        accumulated_darf_balance=Decimal("0.0"),
    )
    mock_profile.return_value = profile

    tx_etf = MagicMock(
        id=101,
        ticker="COIN11",
        type="SELL",
        quantity=Decimal("100"),
        cost_basis=Decimal("40.0"),
        total_value=Decimal("5000.0"),
        transaction_date=datetime(2026, 6, 10),
        is_day_trade=False,
        is_option=False,
    )
    cat_cripto = MagicMock()
    cat_cripto.name = "Cripto"

    for sess_cls in (mock_tax_sess_cls, mock_irpf_sess_cls):
        sess = MagicMock()
        sess_cls.return_value = sess
        sess.__enter__.return_value = sess
        sess.query.return_value.filter_by.return_value.first.return_value = profile
        sess.query.return_value.filter.return_value.all.return_value = []
        sess.query.return_value.join.return_value.join.return_value.filter.return_value.all.return_value = [
            (tx_etf, MagicMock(ticker="COIN11"), cat_cripto)
        ]

    darf_res = calculate_monthly_darf(1, 6, 2026)
    assert darf_res["sales_total_stocks"] == 0.0
    assert darf_res["profits"]["stocks_st"] == pytest.approx(1000.0)
    assert darf_res["taxable_profits"]["stocks_st"] == pytest.approx(1000.0)
    assert darf_res["taxes"]["stocks_st"] == pytest.approx(150.0)
    assert darf_res["darf"]["darf_to_pay"] == pytest.approx(150.0)

    irpf_res = calculate_annual_irpf(user_id=1, year=2026)
    june = next(m for m in irpf_res["renda_variavel"] if m["month"] == 6)
    assert irpf_res["rendimentos_isentos"]["lucro_vendas_20k"] == pytest.approx(0.0)
    assert june["profit_st"] == pytest.approx(1000.0)
    assert june["tax_due"] == pytest.approx(150.0)
