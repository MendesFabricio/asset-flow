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
    pos.manual_dy = 0
    pos.asset.market_data = [MagicMock(price=20.0)]
    mock_positions.return_value.all.return_value = [pos]
    
    # No dividend history and no manual_dy -> must not invent 5% DY
    mock_session.query.return_value.filter_by.return_value.all.return_value = []
    
    res = calculate_dividend_forecast(mock_session)
    
    assert res["status"] == "Sucesso"
    assert res["details"] == []
    assert res["total_projected"] == 0.0


@patch('domain.quant.projection.get_active_positions')
@patch('domain.quant.projection._get_current_user_id', return_value=1)
def test_calculate_dividend_forecast_excludes_presplit_and_old_dividends(mock_uid, mock_positions, mock_session):
    from datetime import date, timedelta
    from db.models import AssetTransaction, CorporateEvent, Dividend

    pos = MagicMock()
    pos.asset_id = 1
    pos.asset.ticker = "HGBS11"
    pos.asset.category.name = "FII"
    pos.quantity = 50
    pos.manual_dy = 0
    mock_positions.return_value.all.return_value = [pos]

    today = date.today()
    split_date = today - timedelta(days=90)
    pre_split_div = MagicMock(date_com=split_date - timedelta(days=10), value_per_share=1.70, type="Rendimento")
    old_div = MagicMock(date_com=today - timedelta(days=500), value_per_share=1.70, type="Rendimento")
    post_split_div = MagicMock(date_com=today - timedelta(days=15), value_per_share=0.17, type="Rendimento")

    split_tx = MagicMock(transaction_date=datetime.combine(split_date, datetime.min.time()))

    def _query_side_effect(model):
        q = MagicMock()
        if model is Dividend:
            q.filter_by.return_value.all.return_value = [pre_split_div, old_div, post_split_div]
        elif model is AssetTransaction:
            q.filter.return_value.filter.return_value.all.return_value = [split_tx]
        elif model is CorporateEvent:
            q.filter.return_value.all.return_value = []
        return q

    mock_session.query.side_effect = _query_side_effect

    res = calculate_dividend_forecast(mock_session)

    assert res["status"] == "Sucesso"
    assert res["total_projected"] == pytest.approx(0.17 * 50, abs=0.01)
    assert len(res["details"]) == 1
