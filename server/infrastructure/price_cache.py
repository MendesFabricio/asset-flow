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
import yfinance as yf

_CACHE: dict = {}
_CACHE_LOCK = threading.Lock()          # Protege o dict _CACHE
_KEY_LOCKS: dict[str, threading.Lock] = {}
_KEY_LOCKS_META = threading.Lock()     # Protege o dict _KEY_LOCKS

PRICE_CACHE_TTL = 3600  # segundos

def _get_key_lock(key: str) -> threading.Lock:
    with _KEY_LOCKS_META:
        if key not in _KEY_LOCKS:
            _KEY_LOCKS[key] = threading.Lock()
        return _KEY_LOCKS[key]


def fetch_price_history(tickers: list, period: str = "1y"):
    """
    Busca histórico de preços com cache TTL de 1h.
    Double-checked locking por chave: apenas 1 download simultâneo
    por conjunto único de tickers.
    """
    cache_key = f"prices:{'|'.join(sorted(tickers))}:{period}"

    # Fast path — sem I/O
    with _CACHE_LOCK:
        entry = _CACHE.get(cache_key)
        if entry and time.monotonic() < entry[1]:
            logging.info(f"💾 Cache HIT: {len(tickers)} tickers ({period})")
            return entry[0]

    # Slow path — serializado por chave (não bloqueia outras chaves)
    key_lock = _get_key_lock(cache_key)
    with key_lock:
        # Double-check após obter lock de chave
        with _CACHE_LOCK:
            entry = _CACHE.get(cache_key)
            if entry and time.monotonic() < entry[1]:
                logging.info(f"💾 Cache HIT (2nd check): {len(tickers)} tickers")
                return entry[0]

        logging.info(f"🌐 Cache MISS: baixando {len(tickers)} tickers ({period})...")
        from utils.http_client import get_secure_session
        secure_session = get_secure_session(timeout=15.0)
        data = yf.download(
            tickers, period=period, group_by="ticker",
            progress=False, auto_adjust=False, threads=False,
            session=secure_session
        )
        with _CACHE_LOCK:
            _CACHE[cache_key] = (data, time.monotonic() + PRICE_CACHE_TTL)

    return data


def invalidate():
    """Limpa todo o cache (chamar após update_prices)."""
    with _CACHE_LOCK:
        _CACHE.clear()
    logging.info("🔄 Cache de histórico invalidado.")
