import pytest
from datetime import date, datetime, timedelta
from decimal import Decimal
from unittest.mock import MagicMock, patch
from routes.fixed_income import calculate_fixed_income_metrics

class MockFixedIncome:
    def __init__(self, index_type, interest_rate, issue_date, due_date):
        self.index_type = index_type
        self.interest_rate = interest_rate
        self.issue_date = issue_date
        self.due_date = due_date

def test_calculate_fixed_income_pre_tax():
    # 1 ano de aplicação (365 dias) -> IR de 17.5% (entre 360 e 720 dias)
    issue = datetime.now() - timedelta(days=365)
    due = datetime.now() + timedelta(days=365)
    fi = MockFixedIncome("PRE", Decimal("10.0"), issue, due)
    
    # 10 cotas a R$ 100 cada = R$ 1000 aplicados
    metrics = calculate_fixed_income_metrics(fi, Decimal("10"), Decimal("100"))
    
    # Valor investido
    assert metrics["total_invested"] == 1000.0
    
    # Bruto acumulado estimado = 1000 * 1.1 = 1100
    assert metrics["gross_value"] == pytest.approx(1100.0, rel=1e-4)
    
    # Lucro bruto = 100
    assert metrics["gross_profit"] == pytest.approx(100.0, rel=1e-4)
    
    # Alíquota de IR = 17.5%
    assert metrics["tax_rate"] == 17.5
    
    # Imposto de renda = 17.5
    assert metrics["tax_value"] == pytest.approx(17.5, rel=1e-4)
    
    # Valor líquido = 1082.5
    assert metrics["net_value"] == pytest.approx(1082.5, rel=1e-4)
    
    # Lucro líquido = 82.5
    assert metrics["net_profit"] == pytest.approx(82.5, rel=1e-4)

def test_calculate_fixed_income_tax_regressive_scales():
    due = datetime.now() + timedelta(days=1000)
    
    # Escala 1: <= 180 dias (22.5%)
    fi1 = MockFixedIncome("PRE", Decimal("10.0"), datetime.now() - timedelta(days=100), due)
    m1 = calculate_fixed_income_metrics(fi1, Decimal("1"), Decimal("100"))
    assert m1["tax_rate"] == 22.5
    
    # Escala 2: 181 a 360 dias (20.0%)
    fi2 = MockFixedIncome("PRE", Decimal("10.0"), datetime.now() - timedelta(days=200), due)
    m2 = calculate_fixed_income_metrics(fi2, Decimal("1"), Decimal("100"))
    assert m2["tax_rate"] == 20.0
    
    # Escala 3: 361 a 720 dias (17.5%)
    fi3 = MockFixedIncome("PRE", Decimal("10.0"), datetime.now() - timedelta(days=400), due)
    m3 = calculate_fixed_income_metrics(fi3, Decimal("1"), Decimal("100"))
    assert m3["tax_rate"] == 17.5
    
    # Escala 4: > 720 dias (15.0%)
    fi4 = MockFixedIncome("PRE", Decimal("10.0"), datetime.now() - timedelta(days=800), due)
    m4 = calculate_fixed_income_metrics(fi4, Decimal("1"), Decimal("100"))
    assert m4["tax_rate"] == 15.0


@patch("routes.fixed_income.get_cdi_period_return")
def test_calculate_fixed_income_cdi_uses_bcb_period_return(mock_cdi):
    mock_cdi.return_value = (12.0, "bcb_cache")
    today = datetime.now().date()
    fi = MockFixedIncome("CDI", Decimal("110.0"), today - timedelta(days=365), today + timedelta(days=365))
    db = MagicMock()

    metrics = calculate_fixed_income_metrics(fi, Decimal("1"), Decimal("1000"), db=db)

    mock_cdi.assert_called_once_with(db, fi.issue_date, today)
    expected_gross = 1000.0 * (1.12 ** 1.10)
    assert metrics["gross_value"] == pytest.approx(expected_gross, rel=1e-4)


@patch("routes.fixed_income.get_monthly_ipca_series")
def test_calculate_fixed_income_ipca_compounds_rate_not_adds(mock_ipca):
    # Constrói 12 meses fechados cuja composição exata resulta em 4,50% de IPCA acumulado
    today = date(2026, 1, 1)
    issue = date(2025, 1, 1)
    monthly_rate = (1.045 ** (1.0 / 12.0)) - 1.0
    ipca_map = {(2025, m): monthly_rate for m in range(1, 13)}
    mock_ipca.return_value = (ipca_map, "bcb_cache")

    fi = MockFixedIncome("IPCA", Decimal("6.0"), issue, date(2030, 1, 1))
    db = MagicMock()

    with patch("routes.fixed_income.datetime") as mock_dt:
        mock_dt.now.return_value = datetime(2026, 1, 1, 12, 0, 0)
        metrics = calculate_fixed_income_metrics(fi, Decimal("1"), Decimal("1000"), db=db)

    # 1.045 * 1.06 = 1.1077 -> R$ 1107.70 (não R$ 1105.00 da soma linear)
    assert metrics["gross_value"] == pytest.approx(1107.70, rel=1e-4)


def test_calculate_fixed_income_zero_days_elapsed():
    today = datetime.now().date()
    fi = MockFixedIncome("CDI", Decimal("100.0"), today, today + timedelta(days=365))
    metrics = calculate_fixed_income_metrics(fi, Decimal("2"), Decimal("500"))
    assert metrics["days_elapsed"] == 0
    assert metrics["gross_value"] == 1000.0
    assert metrics["net_value"] == 1000.0
