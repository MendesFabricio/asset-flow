import pytest
from unittest.mock import MagicMock, patch
from domain.quant.projection import calculate_income_projection, calculate_dividend_forecast
from datetime import datetime

@pytest.fixture
def mock_session():
    return MagicMock()

@patch('domain.quant.projection.get_active_positions')
@patch('domain.quant.projection._get_current_user_id', return_value=1)
def test_calculate_income_projection(mock_uid, mock_positions, mock_session):
    pos = MagicMock()
    pos.asset.market_data = [MagicMock(price=10.0)]
    pos.quantity = 1000
    pos.manual_dy = 6.0 # 6% DY manual
    mock_positions.return_value.all.return_value = [pos]
    
    res = calculate_income_projection(mock_session, monthly_contribution=1000.0, years=10, annual_return_pct=10.0, annual_dividend_yield_pct=6.0)
    
    assert res["status"] == "Sucesso"
    assert res["parametros"]["patrimonio_atual"] == 10000.0
    assert res["parametros"]["renda_atual_estimada"] == 5000.0  # 10000 * 6.0 / 12 = 5000.0
    
    assert res["resultados"]["total_aportado"] == 1000 * 12 * 10
    assert len(res["timeline"]) == 10
    
    # After 10 years, it should have hit some milestones
    assert "marcos_fi" in res
    assert "3000" in res["marcos_fi"]

@patch('domain.quant.projection.get_active_positions')
@patch('domain.quant.projection._get_current_user_id', return_value=1)
def test_calculate_dividend_forecast_with_history(mock_uid, mock_positions, mock_session):
    pos = MagicMock()
    pos.asset_id = 1
    pos.asset.ticker = "PETR4"
    pos.quantity = 100
    mock_positions.return_value.all.return_value = [pos]
    
    div1 = MagicMock()
    div1.date_com = datetime(2026, 1, 15)
    div1.value_per_share = 1.0
    
    div2 = MagicMock()
    div2.date_com = datetime(2026, 1, 16)
    div2.value_per_share = 2.0
    
    # Average for month 1 = 1.5, projected amount = 1.5 * 100 = 150
    mock_session.query.return_value.filter_by.return_value.all.return_value = [div1, div2]
    
    res = calculate_dividend_forecast(mock_session)
    
    assert res["status"] == "Sucesso"
    assert res["total_projected"] == 150.0
    assert len(res["details"]) == 1
    assert res["details"][0]["amount"] == 150.0
    assert res["details"][0]["month"] == 1
    
@patch('domain.quant.projection.get_active_positions')
@patch('domain.quant.projection._get_current_user_id', return_value=1)
def test_calculate_dividend_forecast_without_history(mock_uid, mock_positions, mock_session):
    pos = MagicMock()
    pos.asset_id = 1
    pos.asset.ticker = "PETR4"
    pos.quantity = 100
    pos.asset.market_data = [MagicMock(price=20.0)]
    mock_positions.return_value.all.return_value = [pos]
    
    # No dividend history
    mock_session.query.return_value.filter_by.return_value.all.return_value = []
    
    res = calculate_dividend_forecast(mock_session)
    
    assert res["status"] == "Sucesso"
    assert len(res["details"]) == 12
    # 20 * 0.05 / 12 * 100 = 8.33
    assert abs(res["details"][0]["amount"] - 8.33) < 0.05
    assert abs(res["total_projected"] - 100.0) < 0.1 # 8.33 * 12
