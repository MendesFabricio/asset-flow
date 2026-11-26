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

def _sanitize_price_glitches(prices):
    """Remove glitches isolados de cotação (ex.: erro 100x do Yahoo Finance que reverte em dias)."""
    if prices.empty:
        return prices
    cleaned = prices.copy()
    for col in cleaned.columns:
        s = cleaned[col]
        med = s.rolling(window=21, center=True, min_periods=5).median()
        bad = (s <= 0) | ((med > 0) & ((s < med * 0.20) | (s > med * 5.0)))
        if bad.any():
            logging.warning(f"⚠️ Sanitizando {int(bad.sum())} outlier(s) isolado(s) em {col}")
            cleaned.loc[bad, col] = float("nan")
    return cleaned


def _align_prices_to_b3(prices):
    import pandas as pd
    if prices.empty:
        return prices
    try:
        prices = _sanitize_price_glitches(prices)
        prices.index = pd.to_datetime(prices.index).tz_localize(None).normalize()
        start_date = prices.index.min()
        end_date = prices.index.max()
        
        b3_cal = _get_b3_calendar()
        valid_days = b3_cal.schedule(start_date=start_date, end_date=end_date)
        if valid_days.empty:
            return prices.ffill()
        trading_days = mcal.date_range(valid_days, frequency='1D')
        trading_days = trading_days.tz_localize(None).normalize()
        prices = prices.reindex(trading_days).ffill()
    except Exception as e:
        logging.warning(f"⚠️ Alinhamento B3 falhou: {e}. Usando ffill genérico.")
        prices = prices.ffill()
    return prices

def _to_yf_ticker(ticker: str, category_name: str) -> str:
    return to_yf_ticker(ticker, category_name)

_RF_CACHE = {"value": None, "expires_at": 0.0}

def _new_standalone_session():
    from sqlalchemy.orm import sessionmaker
    from db.models import engine
    return sessionmaker(bind=engine)()


def _read_cached_selic() -> float | None:
    try:
        from db.models import SystemCache
        with _new_standalone_session() as session:
            rec = session.query(SystemCache).filter_by(key="bcb_selic_meta").first()
            if rec and rec.value:
                val = float(rec.value)
                if 0.02 <= val <= 0.30:
                    return val
    except Exception as exc:
        logging.debug(f"Selic cache read fallback: {exc}")
    return None


def _write_cached_selic(val: float) -> None:
    try:
        from datetime import datetime
        from db.models import SystemCache, safe_commit
        with _new_standalone_session() as session:
            rec = session.query(SystemCache).filter_by(key="bcb_selic_meta").first()
            if not rec:
                rec = SystemCache(key="bcb_selic_meta")
                session.add(rec)
            rec.value = f"{val:.6f}"
            rec.updated_at = datetime.now()
            safe_commit(session)
    except Exception as exc:
        logging.debug(f"Selic cache write fallback: {exc}")


def get_risk_free_rate() -> float:
    import time
    now = time.monotonic()
    if _RF_CACHE["value"] is not None and now < _RF_CACHE["expires_at"]:
        return _RF_CACHE["value"]
    rate = None
    try:
        url = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json"
        res = requests.get(url, timeout=5.0)
        if res.status_code == 200:
            val = float(res.json()[0]['valor']) / 100
            if 0.02 <= val <= 0.30:
                rate = val
                _write_cached_selic(val)
    except Exception as exc:
        logging.debug(f"BCB Selic fetch fallback: {exc}")
    if rate is not None:
        _RF_CACHE["value"] = rate
        _RF_CACHE["expires_at"] = now + 3600.0
        return rate

    persisted = _read_cached_selic()
    fallback = persisted if persisted is not None else 0.1050
    _RF_CACHE["value"] = fallback
    _RF_CACHE["expires_at"] = now + 60.0
    return fallback

def _get_current_user_id():
    try:
        from flask import has_request_context, g
        if has_request_context() and hasattr(g, 'user_id'):
            return g.user_id
    except Exception as exc:
        logging.debug(f"Request context user_id fallback: {exc}")
    return 1

def _pick_valid_price_series(adj_s, cls_s):
    """Usa Adj Close, mas recua para Close se Adj Close tiver salto corrompido relativo ao Close (bug Yahoo)."""
    valid = (adj_s > 0) & (cls_s > 0)
    if valid.sum() >= 5:
        ratio = (adj_s[valid] / cls_s[valid])
        rj = (ratio / ratio.shift(1)).dropna()
        if ((rj > 2.5) | (rj < 0.4)).any():
            logging.warning(f"⚠️ Adj Close corrompido detectado ({getattr(adj_s, 'name', 'ticker')}); usando Close nominal.")
            return cls_s
    return adj_s.combine_first(cls_s)


def _extract_close_prices(raw_df):
    """Extrai série Total Return ('Adj Close' com fallback para 'Close') de DataFrame do Yahoo Finance."""
    import pandas as pd
    if raw_df is None or getattr(raw_df, "empty", True):
        return raw_df
    if isinstance(raw_df.columns, pd.MultiIndex):
        lvl1 = raw_df.columns.get_level_values(1)
        if "Adj Close" in lvl1:
            adj = raw_df.xs("Adj Close", axis=1, level=1)
            if "Close" in lvl1:
                cls = raw_df.xs("Close", axis=1, level=1)
                out = adj.copy()
                for col in adj.columns:
                    if col in cls.columns:
                        out[col] = _pick_valid_price_series(adj[col], cls[col])
                return out
            return adj
        return raw_df.xs("Close", axis=1, level=1)
    if "Adj Close" in raw_df.columns:
        adj = raw_df["Adj Close"]
        if "Close" in raw_df.columns:
            return _pick_valid_price_series(adj, raw_df["Close"])
        return adj
    return raw_df["Close"] if "Close" in raw_df.columns else raw_df

def _calculate_ewma_covariance(returns_df, decay=0.94):
    """Calcula a matriz de covariância EWMA para uma série de retornos."""
    alpha = 1.0 - decay
    ewma_cov_df = returns_df.ewm(alpha=alpha).cov()
    return ewma_cov_df.xs(returns_df.index[-1]).fillna(0.0)

_SECTOR_CACHE: dict[str, str] = {}
_SECTOR_CACHE_LOADED = False

_YF_SECTOR_PT = {
    "Financial Services": "Financeiro",
    "Utilities": "Utilidades / Energia",
    "Energy": "Commodities & Materiais",
    "Basic Materials": "Commodities & Materiais",
    "Industrials": "Bens Industriais",
    "Technology": "Tecnologia & Inovação",
    "Communication Services": "Comunicações & Tech",
    "Consumer Defensive": "Consumo & Agronegócio",
    "Consumer Cyclical": "Consumo & Varejo",
    "Real Estate": "Imobiliário",
    "Healthcare": "Saúde",
}


def _load_sector_cache() -> None:
    global _SECTOR_CACHE_LOADED
    if _SECTOR_CACHE_LOADED:
        return
    _SECTOR_CACHE_LOADED = True
    try:
        import json
        from db.models import SystemCache
        with _new_standalone_session() as session:
            rec = session.query(SystemCache).filter_by(key="sector_map_v1").first()
            if rec and rec.value:
                data = json.loads(rec.value)
                if isinstance(data, dict):
                    _SECTOR_CACHE.update({str(k): str(v) for k, v in data.items()})
    except Exception as exc:
        logging.debug(f"Sector cache load fallback: {exc}")


def _save_sector_cache() -> None:
    try:
        import json
        from datetime import datetime
        from db.models import SystemCache, safe_commit
        with _new_standalone_session() as session:
            rec = session.query(SystemCache).filter_by(key="sector_map_v1").first()
            if not rec:
                rec = SystemCache(key="sector_map_v1")
                session.add(rec)
            rec.value = json.dumps(_SECTOR_CACHE)
            rec.updated_at = datetime.now()
            safe_commit(session)
    except Exception as exc:
        logging.debug(f"Sector cache save fallback: {exc}")


def classify_asset_sector(ticker: str, category_name: str) -> str:
    """Classifica dinamicamente um ativo em um setor normalizado via cache/Yahoo Finance e fallback por ticker."""
    t = ticker.upper().strip()
    cat = category_name.strip() if category_name else ""

    if cat in ["Renda Fixa", "Reserva"]:
        return "Reserva & Renda Fixa"
    if cat == "Cripto" or any(x in t for x in ["BTC", "ETH", "SOL", "COIN11", "ETHY11"]):
        return "Tecnologia & Cripto"
    if cat == "FII":
        return "Imobiliário"

    _load_sector_cache()
    if t in _SECTOR_CACHE:
        return _SECTOR_CACHE[t]

    if cat == "Ação":
        try:
            import yfinance as yf
            yf_t = _to_yf_ticker(t, cat)
            info = yf.Ticker(yf_t).info or {}
            raw_sector = info.get("sector")
            if raw_sector and raw_sector in _YF_SECTOR_PT:
                mapped = _YF_SECTOR_PT[raw_sector]
                _SECTOR_CACHE[t] = mapped
                _save_sector_cache()
                return mapped
        except Exception:
            pass

    if any(x in t for x in ["ITUB", "BBDC", "BBAS", "SANB", "ITSA", "BPAC", "BBSE", "CXSE"]):
        return "Financeiro"
    if any(x in t for x in ["EGIE", "EQTL", "CPLE", "TAEE", "TRPL", "ISAE", "ENGI", "CPFE", "ELET", "CMIG", "ALUP", "SBSP", "CSMG", "SAPR", "AURE"]):
        return "Utilidades / Energia"
    if any(x in t for x in ["PETR", "PRIO", "RECV", "ENAT", "RRRP", "CSAN", "VALE", "CSNA", "USIM", "GGBR", "GOAU", "SUZB", "KLBN"]):
        return "Commodities & Materiais"
    if any(x in t for x in ["AAPL", "MSFT", "GOOG", "META", "AMZN", "NVDA", "TSLA", "TOTS"]):
        return "Tecnologia & Inovação"
    if any(x in t for x in ["WEGE", "ROMI", "EMBR"]):
        return "Bens Industriais"
    if any(x in t for x in ["LREN", "MGLU", "SMTO", "SLCE", "BEEF", "JBSS", "MRFG", "ABEV", "ASAI", "CRFB"]):
        return "Consumo & Agronegócio"
    if cat == "Internacional":
        return "Internacional / Global"
    if cat == "Ação":
        return "Outros - Ações"
    return "Outros / Diversificados"
