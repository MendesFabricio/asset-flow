import pytest
import pandas as pd
import numpy as np
from unittest.mock import MagicMock, patch
from datetime import datetime

from domain.quant.monte_carlo import run_monte_carlo

@pytest.fixture
def mock_session():
    return MagicMock()

@pytest.fixture
def dummy_fetch_prices():
    def _fetch(tickers, period):
        dates = pd.date_range(end=datetime.now(), periods=100, freq='B')
        df = pd.DataFrame(index=dates)
        for t in tickers:
            df[(t, "Close")] = np.linspace(20, 30, 100) * (1 + np.random.normal(0, 0.01, 100))
        df.columns = pd.MultiIndex.from_tuples(df.columns)
        return df
    return _fetch

@patch('domain.quant.monte_carlo.get_active_positions')
@patch('domain.quant.monte_carlo._get_current_user_id', return_value=1)
def test_run_monte_carlo_success(mock_uid, mock_positions, mock_session, dummy_fetch_prices):
    pos = MagicMock()
    pos.asset.category.name = "Ação"
    pos.asset.ticker = "PETR4"
    pos.quantity = 100
    pos.asset.market_data = [MagicMock(price=25.0)]
    mock_positions.return_value.all.return_value = [pos]
    
    res = run_monte_carlo(mock_session, fetch_prices=dummy_fetch_prices, simulations=100, days=252)
    
    assert res["status"] == "Sucesso"
    assert "volatilidade_anual" in res
    assert "projecao" in res
    assert len(res["projecao"]["medio"]) == 252
    assert len(res["projecao"]["pior_caso"]) == 252
    assert len(res["projecao"]["melhor_caso"]) == 252

@patch('domain.quant.monte_carlo.get_active_positions')
def test_run_monte_carlo_empty_wallet(mock_positions, mock_session, dummy_fetch_prices):
    mock_positions.return_value.all.return_value = []
    
    res = run_monte_carlo(mock_session, fetch_prices=dummy_fetch_prices)
    
    assert res["status"] == "Erro"
    assert "Carteira vazia" in res["msg"]

@patch('domain.quant.monte_carlo.get_active_positions')
def test_run_monte_carlo_insufficient_data(mock_positions, mock_session):
    pos = MagicMock()
    pos.asset.category.name = "Ação"
    pos.asset.ticker = "PETR4"
    pos.quantity = 100
    pos.asset.market_data = [MagicMock(price=25.0)]
    mock_positions.return_value.all.return_value = [pos]
    
    def short_fetch_prices(tickers, period):
        dates = pd.date_range(end=datetime.now(), periods=10, freq='B')
        df = pd.DataFrame(index=dates)
        for t in tickers:
            df[(t, "Close")] = 10.0
        df.columns = pd.MultiIndex.from_tuples(df.columns)
        return df
        
    res = run_monte_carlo(mock_session, fetch_prices=short_fetch_prices)
    
    assert res["status"] == "Erro"
    assert "insuficiente" in res["msg"].lower()
