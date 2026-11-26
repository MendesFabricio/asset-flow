from flask import Blueprint, jsonify
import yfinance as yf
import time
import logging
from datetime import datetime, timezone
from utils.http_client import get_secure_session

market_bp = Blueprint('market', __name__)

# --- CACHE EM MEMÓRIA ---
MARKET_CACHE = {
    "data": {
        "ibov": {"price": 128500.0, "change": 0.45},
        "ifix": {"price": 3350.0, "change": 0.12},
        "nasdaq": {"price": 16200.0, "change": 0.85},
        "sp500": {"price": 5120.0, "change": 0.62},
        "dolar": {"price": 5.48, "change": -0.32},
        "btc": {"price": 67500.0, "change": 1.45}
    },
    "last_update": 0
}

def load_market_cache_from_db():
    """Recupera os índices macro do banco de dados (SystemCache) compartilhado"""
    import json
    from db.models import Session, SystemCache
    with Session() as session:
        try:
            record = session.query(SystemCache).filter_by(key="market_indices").first()
            if record:
                cached = json.loads(record.value)
                MARKET_CACHE["data"] = cached.get("data", MARKET_CACHE["data"])
                MARKET_CACHE["last_update"] = cached.get("last_update", 0)
        except Exception as e:
            logging.warning(f"⚠️ Falha ao ler índices de mercado do banco de dados: {e}")

def save_market_cache_to_db():
    """Persiste os índices macro no banco de dados (SystemCache) compartilhado"""
    import json
    from db.models import Session, SystemCache, safe_commit
    from datetime import datetime
    with Session() as session:
        try:
            record = session.query(SystemCache).filter_by(key="market_indices").first()
            if not record:
                record = SystemCache(key="market_indices")
                session.add(record)
            record.value = json.dumps(MARKET_CACHE)
            record.updated_at = datetime.now()
            safe_commit(session)
        except Exception as e:
            session.rollback()
            logging.warning(f"⚠️ Falha ao persistir índices de mercado no banco de dados: {e}")

def _fetch_ifix_quote(session) -> tuple[float, float] | None:
    """Busca cotação oficial do IFIX direto da B3 (fallback para Yahoo IFIX.SA fast_info)."""
    try:
        r = session.get(
            "https://cotacao.b3.com.br/mds/api/v1/instrumentQuotation/IFIX",
            headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"},
            timeout=10,
        )
        if r.status_code == 200:
            payload = r.json()
            trad = (payload.get("Trad") or [None])[0] or {}
            qtn = (trad.get("scty") or {}).get("SctyQtn") or {}
            cur_prc = qtn.get("curPrc")
            prc_flcn = qtn.get("prcFlcn")
            if cur_prc is not None and float(cur_prc) > 0:
                return float(cur_prc), float(prc_flcn or 0.0)
    except Exception as e:
        logging.debug(f"Falha ao consultar B3 MDS para IFIX: {e}")

    try:
        fi = yf.Ticker("IFIX.SA", session=session).fast_info
        last_p = fi.get("lastPrice")
        prev_p = fi.get("previousClose") or fi.get("regularMarketPreviousClose")
        if last_p and float(last_p) > 0:
            chg = ((float(last_p) - float(prev_p)) / float(prev_p)) * 100.0 if prev_p and float(prev_p) > 0 else 0.0
            return float(last_p), chg
    except Exception as e:
        logging.debug(f"Falha no fallback fast_info para IFIX.SA: {e}")

    return None


def update_market_cache():
    """Atualiza os dados de mercado em background com proteção de rede e salvamento individual robusto"""
    logging.info("🔄 JOB: Atualizando índices de mercado (IBOV/IFIX)...")
    secure_session = get_secure_session()
    updated = False

    ifix_quote = _fetch_ifix_quote(secure_session)
    if ifix_quote:
        atual, variacao = ifix_quote
        MARKET_CACHE["data"]["ifix"] = {
            "price": round(atual, 2),
            "change": round(variacao, 2),
        }
        MARKET_CACHE["last_update"] = time.time()
        updated = True
        logging.info(f"✅ IFIX atualizado (B3): {atual:.2f} ({variacao:.2f}%)")
    
    indices = [
        {"ticker": "^BVSP", "key": "ibov", "name": "IBOV", "decimals": 2},
        {"ticker": "^IXIC", "key": "nasdaq", "name": "NASDAQ", "decimals": 2},
        {"ticker": "^GSPC", "key": "sp500", "name": "S&P 500", "decimals": 2},
        {"ticker": "USDBRL=X", "key": "dolar", "name": "Dólar", "decimals": 4},
        {"ticker": "BTC-USD", "key": "btc", "name": "BTC", "decimals": 2}
    ]

    import pandas as pd
    tickers_list = [idx["ticker"] for idx in indices]
    batch_df = pd.DataFrame()
    try:
        batch_df = yf.download(
            tickers_list,
            period="5d",
            group_by="ticker",
            auto_adjust=False,
            progress=False,
            session=secure_session,
        )
    except Exception as e:
        logging.warning(f"⚠️ Falha no batch de índices ({e}); tentando individualmente.")

    for idx in indices:
        try:
            tkr = idx["ticker"]
            df = pd.DataFrame()
            if not batch_df.empty and isinstance(batch_df.columns, pd.MultiIndex) and tkr in batch_df.columns.get_level_values(0):
                df = batch_df[tkr].dropna(how="all")
            if df.empty:
                df = yf.download(tkr, period="5d", auto_adjust=False, progress=False, session=secure_session)
            if df.empty and idx.get("fallback"):
                df = yf.download(idx["fallback"], period="5d", auto_adjust=False, progress=False, session=secure_session)

            if not df.empty:
                if isinstance(df.columns, pd.MultiIndex):
                    df.columns = df.columns.get_level_values(0)

                close_col = 'Close' if 'Close' in df.columns else ('Adj Close' if 'Adj Close' in df.columns else None)
                if close_col:
                    series = df[close_col].dropna()
                    if isinstance(series, pd.DataFrame):
                        series = series.iloc[:, 0]

                    if len(series) >= 1:
                        atual = float(series.iloc[-1])
                        variacao = 0.0
                        if len(series) >= 2:
                            anterior = float(series.iloc[-2])
                            if anterior > 0:
                                variacao = ((atual - anterior) / anterior) * 100

                        MARKET_CACHE["data"][idx["key"]] = {
                            "price": round(atual, idx["decimals"]),
                            "change": round(variacao, 2)
                        }
                        MARKET_CACHE["last_update"] = time.time()
                        updated = True
                        logging.info(f"✅ {idx['name']} atualizado: {atual:.{idx['decimals']}f} ({variacao:.2f}%)")
        except Exception as e:
            logging.warning(f"⚠️ Falha ao atualizar {idx['name']}: {e}")

    if updated:
        save_market_cache_to_db()

@market_bp.route('/indices', methods=['GET'])
def get_market_indices():
    if time.time() - float(MARKET_CACHE.get("last_update") or 0.0) > 45:
        load_market_cache_from_db()
    return jsonify(MARKET_CACHE["data"])
