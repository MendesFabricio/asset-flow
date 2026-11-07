import pytest
import math
from decimal import Decimal
from domain.quant.analysis import _to_yf_ticker

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

from unittest.mock import MagicMock, patch
from domain.quant.rebalance import calculate_smart_rebalance

def test_calculate_smart_rebalance_no_positions():
    session_mock = MagicMock()
    with patch('domain.quant.rebalance._get_current_user_id', return_value=1):
        with patch('domain.quant.rebalance.get_active_positions') as mock_get_pos:
            mock_get_pos.return_value.all.return_value = []
            res = calculate_smart_rebalance(session_mock, None, 1000.0)
            assert res['status'] == 'Erro'
            assert 'posições' in res['msg'].lower()

def test_calculate_smart_rebalance_success():
    session_mock = MagicMock()
    
    pos1 = MagicMock()
    pos1.asset.ticker = 'VALE3'
    pos1.asset.category.name = 'Ao'
    pos1.asset.market_data = [MagicMock(price=100.0)]
    pos1.quantity = 10
    pos1.average_price = 90.0
    pos1.target_percent = 50.0
    
    pos2 = MagicMock()
    pos2.asset.ticker = 'PETR4'
    pos2.asset.category.name = 'Ao'
    pos2.asset.market_data = [MagicMock(price=50.0)]
    pos2.quantity = 10
    pos2.average_price = 45.0
    pos2.target_percent = 50.0

    with patch('domain.quant.rebalance._get_current_user_id', return_value=1):
        with patch('domain.quant.rebalance.get_active_positions') as mock_get_pos:
            mock_get_pos.return_value.all.return_value = [pos1, pos2]
            
            def fake_fetch(tickers, period):
                raise Exception('Skip correlation')
                
            res = calculate_smart_rebalance(session_mock, fake_fetch, 500.0)
            
            assert res['status'] == 'Sucesso'
            assert res['total_atual'] == 1500.0
            assert res['total_apos_aporte'] == 2000.0
            assert len(res['sugestoes']) == 1
            sug = res['sugestoes'][0]
            assert sug['ticker'] == 'PETR4'
            assert sug['action'] == 'COMPRAR'
            assert sug['suggested_value'] == 500.0
            assert sug['suggested_lots'] == 10
