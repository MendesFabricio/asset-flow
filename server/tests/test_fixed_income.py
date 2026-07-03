import pytest
from datetime import datetime, timedelta
from decimal import Decimal
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
