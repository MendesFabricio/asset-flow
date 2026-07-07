# server/domain/quant/helpers.py
import logging
import requests
import pandas_market_calendars as mcal
from utils.ticker_helper import to_yf_ticker

def _align_prices_to_b3(prices):
    import pandas as pd
    if prices.empty:
        return prices
    try:
        prices.index = pd.to_datetime(prices.index).tz_localize(None).normalize()
        start_date = prices.index.min()
        end_date = prices.index.max()
        
        b3_cal = mcal.get_calendar('BVMF')
        valid_days = b3_cal.schedule(start_date=start_date, end_date=end_date)
        if valid_days.empty:
            return prices.ffill().bfill()
        trading_days = mcal.date_range(valid_days, frequency='1D')
        trading_days = trading_days.tz_localize(None).normalize()
        prices = prices.reindex(trading_days).ffill().bfill()
    except Exception as e:
        logging.warning(f"⚠️ Alinhamento B3 falhou: {e}. Usando ffill/bfill genérico.")
        prices = prices.ffill().bfill()
    return prices

def _to_yf_ticker(ticker: str, category_name: str) -> str:
    return to_yf_ticker(ticker, category_name)

def get_risk_free_rate() -> float:
    try:
        url = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.1178/dados/ultimos/1?formato=json"
        res = requests.get(url, timeout=3.0)
        if res.status_code == 200:
            val = float(res.json()[0]['valor']) / 100
            if 0.02 <= val <= 0.20:
                return val
    except Exception:
        pass
    return 0.1050
