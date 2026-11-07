import pytest
import pandas as pd
import numpy as np
from unittest.mock import MagicMock, patch
from datetime import datetime

from domain.quant.risk import calculate_risk_metrics

@pytest.fixture
def mock_session():
    session = MagicMock()
    # Assume cache miss
    session.query.return_value.filter_by.return_value.first.return_value = None
    return session

@pytest.fixture
def dummy_fetch_prices():
    def _fetch(tickers, period):
        # Create a dummy DataFrame with prices for PETR4 and ^BVSP
        dates = pd.date_range(end=datetime.now(), periods=40, freq='B')
        
        # Trend up for PETR4, slightly up for ^BVSP
        petr4_prices = np.linspace(20, 30, 40)
        bvsp_prices = np.linspace(100000, 110000, 40)
        
        # Add random noise
        np.random.seed(42)
        petr4_prices *= (1 + np.random.normal(0, 0.01, 40))
        bvsp_prices *= (1 + np.random.normal(0, 0.005, 40))
        
        df = pd.DataFrame(index=dates)
        
        # Structure as multiindex (price, ticker) like yfinance
        for i, t in enumerate(tickers):
            if t == "^BVSP":
                df[(t, "Close")] = bvsp_prices
            else:
                df[(t, "Close")] = petr4_prices
                
        df.columns = pd.MultiIndex.from_tuples(df.columns)
        return df
    return _fetch

@patch('domain.quant.risk.get_active_positions')
@patch('domain.quant.risk.get_risk_free_rate', return_value=0.10)
@patch('domain.quant.risk._get_current_user_id', return_value=1)
def test_calculate_risk_metrics_success(mock_uid, mock_rf, mock_positions, mock_session, dummy_fetch_prices):
    # Setup mock positions
    pos = MagicMock()
    pos.asset.category.name = "AÃ§Ã£o"
    pos.asset.ticker = "PETR4"
    pos.quantity = 100
    pos.asset.market_data = [MagicMock(price=25.0)]
    
    mock_positions.return_value.all.return_value = [pos]
    
    res = calculate_risk_metrics(mock_session, fetch_prices=dummy_fetch_prices, allow_compute=True)
    
    assert res["status"] == "Sucesso"
    assert "beta" in res
    assert "sharpe_12m" in res
    assert "alpha_anual_pct" in res
    assert "var_95_daily_pct" in res
    assert res["n_pregoes"] >= 38
    assert "interpretacao" in res
    
    # Assert cache was written
    mock_session.add.assert_called_once()
    mock_session.commit.assert_called()

@patch('domain.quant.risk.get_active_positions')
def test_calculate_risk_metrics_empty(mock_positions, mock_session, dummy_fetch_prices):
    mock_positions.return_value.all.return_value = []
    
    res = calculate_risk_metrics(mock_session, fetch_prices=dummy_fetch_prices, allow_compute=True)
    
    assert "renda" in res["msg"]

@patch('domain.quant.risk.get_active_positions')
def test_calculate_risk_metrics_insufficient_history(mock_positions, mock_session):
    pos = MagicMock()
    pos.asset.category.name = "AÃ§Ã£o"
    pos.asset.ticker = "PETR4"
    pos.quantity = 100
    pos.asset.market_data = [MagicMock(price=25.0)]
    mock_positions.return_value.all.return_value = [pos]
    
    def short_fetch_prices(tickers, period):
        # Only 10 days of data
        dates = pd.date_range(end=datetime.now(), periods=10, freq='B')
        df = pd.DataFrame(index=dates)
        for t in tickers:
            df[(t, "Close")] = 10.0
        df.columns = pd.MultiIndex.from_tuples(df.columns)
        return df
        
    res = calculate_risk_metrics(mock_session, fetch_prices=short_fetch_prices, allow_compute=True)
    
    assert "indispon" in res["msg"].lower() or "insuficiente" in res["msg"].lower()
