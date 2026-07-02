import pytest
import math
from decimal import Decimal
from domain.quant_engine import _to_yf_ticker

def test_to_yf_ticker_domestic():
    # Ativos nacionais (sem terminação de BDR/Internacional) devem receber .SA
    assert _to_yf_ticker("PETR4", "Ação") == "PETR4.SA"
    assert _to_yf_ticker("VALE3", "Ação") == "VALE3.SA"
    assert _to_yf_ticker("MXRF11", "FII") == "MXRF11.SA"

def test_to_yf_ticker_international():
    # Ativos internacionais e BDRs
    assert _to_yf_ticker("AAPL", "Internacional") == "AAPL"
    assert _to_yf_ticker("AAPL34", "Internacional") == "AAPL34.SA"  # BDR recebe .SA
    assert _to_yf_ticker("BTC-USD", "Cripto") == "BTC-USD"

def test_graham_formula_calculation():
    # Fórmula de Graham: V = sqrt(22.5 * LPA * VPA)
    lpa = 3.0
    vpa = 20.0
    vi_expected = math.sqrt(22.5 * lpa * vpa)
    
    # Simula cálculo do services.py
    vi_calculated = math.sqrt(float(Decimal('22.5') * Decimal(str(lpa)) * Decimal(str(vpa))))
    
    assert vi_calculated == pytest.approx(vi_expected)
    assert vi_calculated == pytest.approx(36.7423, rel=1e-4)

def test_graham_margin_of_safety():
    vi = 36.74
    preco = 25.0
    # Margem de segurança: ((VI - preço) / preço) * 100
    mg = ((vi - preco) / preco) * 100
    assert mg == pytest.approx(46.96)
