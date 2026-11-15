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
    pos1.asset.name = 'Vale'
    pos1.asset.currency = 'BRL'
    pos1.asset.category.name = 'Ao'
    pos1.asset.category.target_percent = 100.0
    pos1.asset.market_data = [MagicMock(price=100.0)]
    pos1.quantity = 10
    pos1.average_price = 90.0
    pos1.target_percent = 50.0
    
    pos2 = MagicMock()
    pos2.asset.ticker = 'PETR4'
    pos2.asset.name = 'Petrobras'
    pos2.asset.currency = 'BRL'
    pos2.asset.category.name = 'Ao'
    pos2.asset.category.target_percent = 100.0
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


def test_calculate_smart_rebalance_routes_leftovers_to_caixinha_and_uses_global_target():
    session_mock = MagicMock()

    # Renda Fixa category = 50% of portfolio, B5P211 = 100% within Renda Fixa -> global target = 50%
    pos_rf = MagicMock()
    pos_rf.asset.ticker = 'B5P211'
    pos_rf.asset.name = 'ETF B5P211'
    pos_rf.asset.currency = 'BRL'
    pos_rf.asset.category.name = 'Renda Fixa'
    pos_rf.asset.category.target_percent = 50.0
    pos_rf.asset.market_data = [MagicMock(price=114.76)]
    pos_rf.quantity = 1
    pos_rf.average_price = 114.76
    pos_rf.target_percent = 100.0

    # Reserva category = 50% of portfolio, NUBANK CAIXINHA = 100% within Reserva -> global target = 50%
    pos_res = MagicMock()
    pos_res.asset.ticker = 'NUBANK CAIXINHA'
    pos_res.asset.name = 'Nubank Caixinha'
    pos_res.asset.currency = 'BRL'
    pos_res.asset.category.name = 'Reserva'
    pos_res.asset.category.target_percent = 50.0
    pos_res.asset.market_data = [MagicMock(price=1245.48)]
    pos_res.quantity = 1
    pos_res.average_price = 1000.0
    pos_res.target_percent = 100.0

    # Reserva de Oportunidade with 0% target should be prioritized for leftover cash
    pos_opo = MagicMock()
    pos_opo.asset.ticker = 'RESERVA DE OPORTUNIDADE'
    pos_opo.asset.name = 'Caixinha Oportunidade'
    pos_opo.asset.currency = 'BRL'
    pos_opo.asset.category.name = 'Reserva'
    pos_opo.asset.category.target_percent = 50.0
    pos_opo.asset.market_data = [MagicMock(price=100.0)]
    pos_opo.quantity = 1
    pos_opo.average_price = 100.0
    pos_opo.target_percent = 0.0

    with patch('domain.quant.rebalance._get_current_user_id', return_value=1):
        with patch('domain.quant.rebalance.get_active_positions') as mock_get_pos:
            mock_get_pos.return_value.all.return_value = [pos_rf, pos_res, pos_opo]
            res = calculate_smart_rebalance(session_mock, lambda *a, **kw: None, 1000.0)

    assert res['status'] == 'Sucesso'
    assert res['sobra'] == 0.0
    assert res['reserva_sobra'] > 0.0
    total_allocated = sum(s['suggested_value'] for s in res['sugestoes'])
    assert total_allocated == pytest.approx(1000.0, abs=0.02)
    b5p = next(s for s in res['sugestoes'] if s['ticker'] == 'B5P211')
    assert b5p['target_pct'] == pytest.approx(50.0)
    opo = next(s for s in res['sugestoes'] if s['ticker'] == 'RESERVA DE OPORTUNIDADE')
    assert opo['lot_size'] == 0
    assert opo['suggested_value'] == pytest.approx(res['reserva_sobra'])


def test_price_cache_reuses_individual_tickers_and_uses_threads():
    import pandas as pd
    from infrastructure import price_cache

    price_cache.invalidate()
    dates = pd.date_range("2026-01-01", periods=3, freq="D")
    mock_df = pd.concat(
        {
            "PETR4.SA": pd.DataFrame({"Close": [30.0, 31.0, 32.0]}, index=dates),
            "^BVSP": pd.DataFrame({"Close": [120000.0, 121000.0, 122000.0]}, index=dates),
        },
        axis=1,
    )

    with patch("infrastructure.price_cache.yf.download", return_value=mock_df) as mock_dl:
        res1 = price_cache.fetch_price_history(["PETR4.SA", "^BVSP"], period="1y")
        res2 = price_cache.fetch_price_history(["PETR4.SA"], period="1y")

    assert mock_dl.call_count == 1
    assert mock_dl.call_args.kwargs.get("threads") is True
    assert "PETR4.SA" in res1.columns.get_level_values(0)
    assert "PETR4.SA" in res2.columns.get_level_values(0)
    price_cache.invalidate()


def test_get_risk_free_rate_is_cached():
    from domain.quant import helpers

    helpers._RF_CACHE["value"] = None
    helpers._RF_CACHE["expires_at"] = 0.0
    fake_resp = MagicMock(status_code=200)
    fake_resp.json.return_value = [{"valor": "11.25"}]

    with patch("domain.quant.helpers.requests.get", return_value=fake_resp) as mock_get:
        r1 = helpers.get_risk_free_rate()
        r2 = helpers.get_risk_free_rate()

    assert r1 == pytest.approx(0.1125)
    assert r2 == pytest.approx(0.1125)
    assert mock_get.call_count == 1
