import numpy as np
import pandas as pd
from unittest.mock import MagicMock
import sys
import os

# Adiciona o diretório server ao path para importação
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from domain.quant_engine import (
    calculate_kelly_criterion,
    calculate_alpha_attribution,
    calculate_rolling_sharpe,
    calculate_momentum_ranking
)

def create_mock_prices_df(tickers, num_days=100):
    # Cria preços com uma tendência aleatória ou constante
    dates = pd.date_range(end="2026-06-01", periods=num_days, freq="D")
    data = {}
    for i, t in enumerate(tickers):
        # Cada ticker tem um retorno médio ligeiramente diferente
        returns = np.random.normal(loc=0.001 * (i + 1), scale=0.01, size=num_days)
        prices = 100 * np.exp(np.cumsum(returns))
        data[t] = prices
    
    df = pd.DataFrame(data, index=dates)
    # Recharts/Yfinance format
    df.columns = pd.MultiIndex.from_product([df.columns, ["Close"]])
    return df

def test_calculate_kelly_criterion_math():
    print("Running test_calculate_kelly_criterion_math...")
    # Mock do session do DB
    session_mock = MagicMock()
    
    # Mock das posições
    pos1 = MagicMock()
    pos1.asset.ticker = "PETR4"
    pos1.asset.category.name = "Ação"
    pos1.quantity = 100
    
    pos2 = MagicMock()
    pos2.asset.ticker = "VALE3"
    pos2.asset.category.name = "Ação"
    pos2.quantity = 50
    
    session_mock.query.return_value.filter.return_value.all.return_value = [pos1, pos2]
    
    # Mock do fetch_prices
    mock_df = create_mock_prices_df(["PETR4.SA", "VALE3.SA"], num_days=50)
    fetch_prices_mock = MagicMock(return_value=mock_df)
    
    res = calculate_kelly_criterion(session_mock, fetch_prices_mock)
    
    assert res["status"] == "Sucesso"
    assert len(res["data"]) == 2
    for item in res["data"]:
        assert "ticker" in item
        assert "win_rate" in item
        assert "kelly_quarter_limit" in item
        # O limite de Kelly 1/4 deve respeitar o teto rígido de 12%
        assert item["kelly_quarter_limit"] <= 12.0
        assert item["kelly_half_limit"] <= 12.0
    print("✅ test_calculate_kelly_criterion_math passed!")

def test_calculate_alpha_attribution_math():
    print("Running test_calculate_alpha_attribution_math...")
    session_mock = MagicMock()
    
    pos1 = MagicMock()
    pos1.asset.ticker = "PETR4"
    pos1.asset.category.name = "Ação"
    pos1.asset.market_data = [MagicMock(price=40.0)]
    pos1.quantity = 100
    
    pos2 = MagicMock()
    pos2.asset.ticker = "VALE3"
    pos2.asset.category.name = "Ação"
    pos2.asset.market_data = [MagicMock(price=80.0)]
    pos2.quantity = 50
    
    session_mock.query.return_value.filter.return_value.all.return_value = [pos1, pos2]
    
    # Mock do fetch_prices (incluindo o benchmark)
    mock_df = create_mock_prices_df(["PETR4.SA", "VALE3.SA", "^BVSP"], num_days=50)
    fetch_prices_mock = MagicMock(return_value=mock_df)
    
    res = calculate_alpha_attribution(session_mock, fetch_prices_mock)
    
    assert res["status"] == "Sucesso"
    assert "portfolio_alpha_pct" in res
    assert "portfolio_beta" in res
    assert len(res["data"]) == 2
    
    # A soma das contribuições de Alpha deve somar aproximadamente ao Alpha do portfólio
    sum_contributions = sum(item["weighted_alpha_pct"] for item in res["data"])
    assert abs(sum_contributions - res["portfolio_alpha_pct"]) < 1e-1
    print("✅ test_calculate_alpha_attribution_math passed!")

def test_calculate_rolling_sharpe_math():
    print("Running test_calculate_rolling_sharpe_math...")
    session_mock = MagicMock()
    
    pos1 = MagicMock()
    pos1.asset.ticker = "PETR4"
    pos1.asset.category.name = "Ação"
    pos1.asset.market_data = [MagicMock(price=40.0)]
    pos1.quantity = 100
    
    session_mock.query.return_value.filter.return_value.all.return_value = [pos1]
    
    # Exige mais de 90 dias úteis
    mock_df = create_mock_prices_df(["PETR4.SA"], num_days=200)
    fetch_prices_mock = MagicMock(return_value=mock_df)
    
    res = calculate_rolling_sharpe(session_mock, fetch_prices_mock)
    
    assert res["status"] == "Sucesso"
    assert "dates" in res
    assert "series" in res
    assert "PETR4" in res["series"]
    assert "portfolio" in res["series"]
    assert len(res["dates"]) > 0
    print("✅ test_calculate_rolling_sharpe_math passed!")

def test_calculate_momentum_ranking_math():
    print("Running test_calculate_momentum_ranking_math...")
    session_mock = MagicMock()
    
    pos1 = MagicMock()
    pos1.asset.ticker = "PETR4"
    pos1.asset.category.name = "Ação"
    pos1.quantity = 100
    
    pos2 = MagicMock()
    pos2.asset.ticker = "VALE3"
    pos2.asset.category.name = "Ação"
    pos2.quantity = 50
    
    session_mock.query.return_value.filter.return_value.all.return_value = [pos1, pos2]
    
    mock_df = create_mock_prices_df(["PETR4.SA", "VALE3.SA"], num_days=120)
    fetch_prices_mock = MagicMock(return_value=mock_df)
    
    res = calculate_momentum_ranking(session_mock, fetch_prices_mock)
    
    assert res["status"] == "Sucesso"
    assert len(res["data"]) == 2
    assert res["data"][0]["rank"] == 1
    assert res["data"][1]["rank"] == 2
    assert "momentum_score_pct" in res["data"][0]
    print("✅ test_calculate_momentum_ranking_math passed!")

if __name__ == '__main__':
    print("🚀 Iniciando execução de testes quantitativos avançados...")
    test_calculate_kelly_criterion_math()
    test_calculate_alpha_attribution_math()
    test_calculate_rolling_sharpe_math()
    test_calculate_momentum_ranking_math()
    print("🎉 Todos os testes avançados passaram com sucesso!")
