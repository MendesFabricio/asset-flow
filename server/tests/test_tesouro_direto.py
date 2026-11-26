from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest

from infrastructure.tesouro_direto import (
    TesouroDiretoProvider,
    TesouroDiretoQuote,
    infer_index_and_rate,
    is_tesouro_ticker,
    parse_brl_decimal,
    parse_tesouro_ticker,
    tesouro_ticker_for,
)
from routes.fixed_income import calculate_fixed_income_metrics

SAMPLE_CSV = """Tipo Titulo;Data Vencimento;Data Base;Taxa Compra Manha;Taxa Venda Manha;PU Compra Manha;PU Venda Manha;PU Base Manha
Tesouro IPCA+;15/05/2035;20/11/2026;6,45;6,57;2.300,10;2.290,00;2.295,50
Tesouro IPCA+;15/05/2035;21/11/2026;6,52;6,64;2.350,00;2.340,00;2.345,12
Tesouro Selic;01/03/2029;21/11/2026;0,08;0,09;15.420,10;15.415,00;15.418,25
Tesouro Prefixado;01/01/2020;21/11/2026;11,00;11,10;990,00;985,00;988,00
"""


class _MockFixedIncome:
    def __init__(self, index_type, interest_rate, issue_date, due_date):
        self.index_type = index_type
        self.interest_rate = interest_rate
        self.issue_date = issue_date
        self.due_date = due_date


def test_tesouro_ticker_fits_schema_limit_and_roundtrips():
    ticker = tesouro_ticker_for("Tesouro IPCA+", date(2035, 5, 15))
    assert len(ticker) <= 20
    assert is_tesouro_ticker(ticker)
    title_hash, maturity = parse_tesouro_ticker(ticker)
    assert len(title_hash) == 6
    assert maturity == date(2035, 5, 15)


def test_parse_brl_decimal():
    assert parse_brl_decimal("15.418,25") == Decimal("15418.25")
    assert parse_brl_decimal("6,52") == Decimal("6.52")


def test_provider_selects_latest_data_base_and_filters_matured():
    provider = TesouroDiretoProvider(csv_text=SAMPLE_CSV)
    bonds = provider.get_available_bonds(today=date(2026, 11, 21))

    assert len(bonds) == 2
    ipca = next(b for b in bonds if "IPCA" in b.title_type)
    assert ipca.price_date == date(2026, 11, 21)
    assert ipca.pu_base == Decimal("2345.12")
    assert ipca.taxa_compra == Decimal("6.52")

    found = provider.get_quote_by_ticker(ipca.ticker)
    assert found is not None
    assert found.pu_base == Decimal("2345.12")


def test_infer_index_and_rate():
    assert infer_index_and_rate("Tesouro Selic", Decimal("0.08")) == ("CDI", Decimal("100.0"))
    assert infer_index_and_rate("Tesouro IPCA+", Decimal("6.52")) == ("IPCA", Decimal("6.52"))
    assert infer_index_and_rate("Tesouro Prefixado", Decimal("13.20")) == ("PRE", Decimal("13.20"))


def test_calculate_fixed_income_metrics_tesouro_mtm_positive_and_negative():
    issue = datetime.now() - timedelta(days=400)
    due = datetime.now() + timedelta(days=2000)
    fi = _MockFixedIncome("IPCA", Decimal("6.5"), issue, due)

    quote_up = TesouroDiretoQuote(
        title_type="Tesouro IPCA+",
        maturity_date=due.date(),
        price_date=date(2026, 11, 21),
        pu_base=Decimal("2500.00"),
    )
    m_up = calculate_fixed_income_metrics(fi, Decimal("2"), Decimal("2000.00"), market_quote=quote_up)
    assert m_up["pricing_mode"] == "TESOURO_MTM"
    assert m_up["market_pu"] == 2500.0
    assert m_up["gross_value"] == 5000.0
    assert m_up["gross_profit"] == 1000.0
    assert m_up["tax_rate"] == 17.5
    assert m_up["tax_value"] == pytest.approx(175.0)
    assert m_up["net_value"] == pytest.approx(4825.0)

    quote_down = TesouroDiretoQuote(
        title_type="Tesouro IPCA+",
        maturity_date=due.date(),
        price_date=date(2026, 11, 21),
        pu_base=Decimal("1800.00"),
    )
    m_down = calculate_fixed_income_metrics(fi, Decimal("2"), Decimal("2000.00"), market_quote=quote_down)
    assert m_down["pricing_mode"] == "TESOURO_MTM"
    assert m_down["gross_value"] == 3600.0
    assert m_down["tax_value"] == 0.0
    assert m_down["net_value"] == 3600.0
    assert m_down["net_profit"] == -400.0
