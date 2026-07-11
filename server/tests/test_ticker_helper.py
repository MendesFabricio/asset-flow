import pytest

class TestTickerHelper:
    def test_to_yf_ticker_domestic(self):
        from utils.ticker_helper import to_yf_ticker
        assert to_yf_ticker("PETR4", "Ação") == "PETR4.SA"

    def test_to_yf_ticker_international(self):
        from utils.ticker_helper import to_yf_ticker
        assert to_yf_ticker("AAPL", "Internacional") == "AAPL"

    def test_to_yf_ticker_already_normalized(self):
        from utils.ticker_helper import to_yf_ticker
        assert to_yf_ticker("PETR4.SA", "Ação") == "PETR4.SA"

    def test_to_yf_ticker_bdr(self):
        from utils.ticker_helper import to_yf_ticker
        result = to_yf_ticker("AAPL34", "BDR")
        assert result == "AAPL34.SA"
