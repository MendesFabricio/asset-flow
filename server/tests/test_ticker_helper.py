import pytest
from utils.ticker_helper import to_yf_ticker

def test_to_yf_ticker_domestic():
    assert to_yf_ticker("PETR4", "Ação") == "PETR4.SA"
    assert to_yf_ticker("VALE3", "Ação") == "VALE3.SA"
    assert to_yf_ticker("MXRF11", "FII") == "MXRF11.SA"
    assert to_yf_ticker("BOVA11", "ETF") == "BOVA11.SA"

def test_to_yf_ticker_already_normalized():
    assert to_yf_ticker("PETR4.SA", "Ação") == "PETR4.SA"
    assert to_yf_ticker("BTC-USD", "Cripto") == "BTC-USD"

def test_to_yf_ticker_international():
    assert to_yf_ticker("AAPL", "Internacional") == "AAPL"
    assert to_yf_ticker("TSLA", "Internacional") == "TSLA"

def test_to_yf_ticker_bdr():
    # BDRs em categoria Internacional que terminam com 34, 33, 39, 11 etc. devem receber .SA
    assert to_yf_ticker("AAPL34", "Internacional") == "AAPL34.SA"
    assert to_yf_ticker("GOGL34", "Internacional") == "GOGL34.SA"
