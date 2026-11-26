"""
infrastructure/price_cache.py
Cache TTL de 1h para histórico de preços do Yahoo Finance.

Correção de race condition: per-key lock impede que dois threads
baixem o mesmo conjunto de tickers simultaneamente.
O lock global (_CACHE_LOCK) protege apenas leituras/escritas no dict.

LIMITAÇÕES DO CACHE EM MEMÓRIA:
- Cache volátil: perdido em restart do processo/worker.
- Multi-workers não compartilham cache (cada processo tem seu próprio dict).
- Adequado para 1 worker. Se escalar para N workers, considerar Redis.

Para migrar para Redis no futuro, substitua _CACHE por redis-py client
mantendo a mesma interface fetch_price_history/invalidate.
"""
import threading
import time
import logging
import pandas as pd
import yfinance as yf
from collections import OrderedDict

MAX_CACHE_SIZE = 50
_CACHE: OrderedDict = OrderedDict()
_TICKER_CACHE: dict[tuple[str, str], tuple[pd.DataFrame, float]] = {}
_CACHE_LOCK = threading.Lock()          # Protege os dicts _CACHE e _TICKER_CACHE
_KEY_LOCKS: dict[str, threading.Lock] = {}
_KEY_LOCKS_META = threading.Lock()     # Protege o dict _KEY_LOCKS

PRICE_CACHE_TTL = 3600  # segundos


def _get_key_lock(key: str) -> threading.Lock:
    with _KEY_LOCKS_META:
        if key not in _KEY_LOCKS:
            _KEY_LOCKS[key] = threading.Lock()
        return _KEY_LOCKS[key]


def _extract_ticker_slices(data: pd.DataFrame, requested: list[str]) -> dict[str, pd.DataFrame]:
    """Extrai DataFrame OHLCV individual por ticker a partir do retorno do yf.download."""
    slices: dict[str, pd.DataFrame] = {}
    if data is None or data.empty:
        return slices
    if isinstance(data.columns, pd.MultiIndex):
        lvl0 = set(data.columns.get_level_values(0))
        for t in requested:
            if t in lvl0:
                sub = data[t].dropna(how="all")
                if not sub.empty:
                    slices[t] = sub
    elif len(requested) == 1:
        sub = data.dropna(how="all")
        if not sub.empty:
            slices[requested[0]] = sub
    return slices


def fetch_price_history(tickers: list, period: str = "1y"):
    """
    Busca histórico de preços com cache TTL de 1h por conjunto e por ticker.
    Reaproveita tickers já baixados em chamadas anteriores e baixa apenas os faltantes
    em paralelo (threads=True).
    """
    unique_tickers = list(dict.fromkeys(tickers))
    if not unique_tickers:
        return pd.DataFrame()

    cache_key = f"prices:{'|'.join(sorted(unique_tickers))}:{period}"
    now = time.monotonic()

    # Fast path — cache exato
    with _CACHE_LOCK:
        entry = _CACHE.get(cache_key)
        if entry and now < entry[1]:
            _CACHE.move_to_end(cache_key)
            logging.info(f"💾 Cache HIT: {len(unique_tickers)} tickers ({period})")
            return entry[0]

    key_lock = _get_key_lock(cache_key)
    with key_lock:
        now = time.monotonic()
        with _CACHE_LOCK:
            entry = _CACHE.get(cache_key)
            if entry and now < entry[1]:
                _CACHE.move_to_end(cache_key)
                return entry[0]

            frames: dict[str, pd.DataFrame] = {}
            missing: list[str] = []
            for t in unique_tickers:
                t_entry = _TICKER_CACHE.get((t, period))
                if t_entry and now < t_entry[1]:
                    frames[t] = t_entry[0]
                else:
                    missing.append(t)

        if not missing:
            logging.info(f"💾 Ticker Cache HIT (100%): {len(unique_tickers)} tickers ({period})")
            combined = pd.concat(frames, axis=1)
        else:
            logging.info(f"🌐 Cache MISS: baixando {len(missing)}/{len(unique_tickers)} tickers ({period})...")
            from utils.http_client import get_secure_session
            secure_session = get_secure_session(timeout=15.0)
            downloaded = pd.DataFrame()
            new_slices: dict[str, pd.DataFrame] = {}
            try:
                downloaded = yf.download(
                    missing, period=period, group_by="ticker",
                    progress=False, auto_adjust=False, threads=True,
                    session=secure_session,
                )
                new_slices = _extract_ticker_slices(downloaded, missing)
            except Exception as e:
                logging.warning(f"⚠️ Falha no lote yf.download ({len(missing)} tickers), usando fallback individual: {e}")

            # Fallback individual para tickers ausentes do lote
            for t in missing:
                if t not in new_slices or new_slices[t].empty:
                    try:
                        hist = yf.Ticker(t, session=secure_session).history(period=period, auto_adjust=False)
                        if hist is not None and not hist.empty:
                            new_slices[t] = hist
                    except Exception as te:
                        logging.debug(f"⚠️ Fallback individual falhou para {t}: {te}")

            now_m = time.monotonic()
            with _CACHE_LOCK:
                for t in missing:
                    df_slice = new_slices.get(t)
                    if df_slice is not None and not df_slice.empty:
                        _TICKER_CACHE[(t, period)] = (df_slice, now_m + PRICE_CACHE_TTL)
                        frames[t] = df_slice
                    else:
                        # Negative cache curto (5 min) para evitar rajadas em tickers inválidos
                        _TICKER_CACHE[(t, period)] = (pd.DataFrame(), now_m + 300)
                while len(_TICKER_CACHE) > 300:
                    oldest_key = next(iter(_TICKER_CACHE))
                    _TICKER_CACHE.pop(oldest_key, None)
            non_empty = {k: v for k, v in frames.items() if v is not None and not v.empty}
            combined = pd.concat(non_empty, axis=1) if non_empty else downloaded

        with _CACHE_LOCK:
            if cache_key in _CACHE:
                _CACHE.move_to_end(cache_key)
            _CACHE[cache_key] = (combined, time.monotonic() + PRICE_CACHE_TTL)
            if len(_CACHE) > MAX_CACHE_SIZE:
                _CACHE.popitem(last=False)

    return combined


def invalidate():
    """Limpa todo o cache (chamar após update_prices)."""
    with _CACHE_LOCK:
        _CACHE.clear()
        _TICKER_CACHE.clear()
    logging.info("🔄 Cache de histórico invalidado.")
