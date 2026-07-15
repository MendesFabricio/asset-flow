# server/domain/quant/helpers.py
import logging
import requests
import pandas_market_calendars as mcal
from utils.ticker_helper import to_yf_ticker

# Cache global de nível de módulo para o calendário B3
_B3_CALENDAR_CACHE = None

def _get_b3_calendar():
    global _B3_CALENDAR_CACHE
    if _B3_CALENDAR_CACHE is None:
        _B3_CALENDAR_CACHE = mcal.get_calendar('BVMF')
    return _B3_CALENDAR_CACHE

def _align_prices_to_b3(prices):
    import pandas as pd
    if prices.empty:
        return prices
    try:
        prices.index = pd.to_datetime(prices.index).tz_localize(None).normalize()
        start_date = prices.index.min()
        end_date = prices.index.max()
        
        b3_cal = _get_b3_calendar()
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
        url = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json"
        res = requests.get(url, timeout=3.0)
        if res.status_code == 200:
            val = float(res.json()[0]['valor']) / 100
            if 0.02 <= val <= 0.20:
                return val
    except Exception:
        pass
    return 0.1050

def _get_current_user_id():
    try:
        from flask import has_request_context, g
        if has_request_context() and hasattr(g, 'user_id'):
            return g.user_id
    except Exception:
        pass
    return 1

def _extract_close_prices(raw_df):
    """Extrai coluna 'Close' de um DataFrame do Yahoo Finance, lidando com MultiIndex e colunas normais."""
    import pandas as pd
    if raw_df.empty:
        return raw_df
    if isinstance(raw_df.columns, pd.MultiIndex):
        return raw_df.xs("Close", axis=1, level=1)
    else:
        return raw_df["Close"] if "Close" in raw_df.columns else raw_df

def _calculate_ewma_covariance(returns_df, decay=0.94):
    """Calcula a matriz de covariância EWMA para uma série de retornos."""
    alpha = 1.0 - decay
    ewma_cov_df = returns_df.ewm(alpha=alpha).cov()
    return ewma_cov_df.xs(returns_df.index[-1]).fillna(0.0)

def classify_asset_sector(ticker: str, category_name: str) -> str:
    """Classifica dinamicamente um ativo em um setor normalizado com base em seu ticker e categoria."""
    t = ticker.upper().strip()
    cat = category_name.strip() if category_name else ""
    
    if cat in ["Renda Fixa", "Reserva"]:
        return "Reserva & Renda Fixa"
    if cat == "Cripto" or any(x in t for x in ["BTC", "ETH", "SOL"]):
        return "Tecnologia & Cripto"
        
    # Setor Financeiro (Bancos, Seguradoras, FIIs de Recebíveis/Papel)
    if any(x in t for x in ["ITUB", "BBDC", "BBAS", "SANB", "ITSA", "BPAC", "BBPO", "BBRC", "KNCR", "HGCR", "MXRF", "CPTS", "KNIP"]):
        return "Financeiro"
        
    # Setor Elétrico / Saneamento / Utilidades
    if any(x in t for x in ["EGIE", "EQTL", "CPLE", "TAEE", "TRPL", "ENGI", "CPFE", "ELET", "CMIG", "ALUP", "SBSP", "CSMG"]):
        return "Utilidades / Energia"
        
    # Commodities, Mineração, Siderurgia, Petróleo
    if any(x in t for x in ["PETR", "PRIO", "RECV", "ENAT", "RRRP", "CSAN", "VALE", "CSNA", "USIM", "GGBR", "SUZB", "KLBN"]):
        return "Commodities & Materiais"
        
    # Empresas de Tecnologia globais e locais, Bens Industriais complexos
    if any(x in t for x in ["AAPL", "MSFT", "GOOG", "META", "AMZN", "NVDA", "TSLA", "TOTS", "WEGE", "NTCO"]):
        return "Tecnologia & Inovação"
        
    # Setor Imobiliário / FIIs de Tijolo / Incorporadoras
    if cat == "FII" or any(x in t for x in ["HGBS", "VISC", "HGLG", "BTLG", "XPLG", "HGRE", "BRCO", "KNRI", "XPML", "HFOF"]):
        return "Imobiliário"
        
    # Varejo, Alimentos, Agronegócio
    if any(x in t for x in ["LREN", "MGLU", "SMTO", "SLCE", "BEEF", "JBSS", "MRFG", "ABEV", "ASAI", "CRFB"]):
        return "Consumo & Agronegócio"
        
    # Fallback por Categoria principal se não casou com tickers conhecidos
    if cat == "FII":
        return "Imobiliário"
    if cat == "Ação":
        return "Outros - Ações"
        
    return "Outros / Diversificados"
