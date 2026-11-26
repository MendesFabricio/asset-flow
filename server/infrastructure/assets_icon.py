import os
import re
import html
import logging
import requests
from urllib.parse import urlparse
from flask import Blueprint, Response

assets_icon_bp = Blueprint('assets_icon', __name__)

_DEFAULT_ICONS_DIR = "/app/data/icons/v2"
try:
    os.makedirs(_DEFAULT_ICONS_DIR, exist_ok=True)
    ICONS_DIR = _DEFAULT_ICONS_DIR
except OSError:
    ICONS_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "icons", "v2")
    os.makedirs(ICONS_DIR, exist_ok=True)

_BANK_DOMAINS = {
    "nubank": "nubank.com.br",
    "nu ": "nubank.com.br",
    "caixinha": "nubank.com.br",
    "inter": "bancointer.com.br",
    "itau": "itau.com.br",
    "itaú": "itau.com.br",
    "btg": "btgpactual.com",
    "xp": "xpi.com.br",
    "bradesco": "bradesco.com.br",
    "santander": "santander.com.br",
    "c6": "c6bank.com.br",
    "picpay": "picpay.com",
    "mercadopago": "mercadopago.com.br",
    "mercado pago": "mercadopago.com.br",
    "sofisa": "sofisadireto.com.br",
    "daycoval": "daycoval.com.br",
    "pagbank": "pagseguro.uol.com.br",
    "pagseguro": "pagseguro.uol.com.br",
    "caixa": "caixa.gov.br",
    "banco do brasil": "bb.com.br",
}

_CRYPTO_ALIASES = {
    "BITCOIN": "btc",
    "ETHEREUM": "eth",
    "SOLANA": "sol",
    "CARDANO": "ada",
    "RIPPLE": "xrp",
    "DOGECOIN": "doge",
    "TETHER": "usdt",
    "LITECOIN": "ltc",
    "POLKADOT": "dot",
    "AVALANCHE": "avax",
    "CHAINLINK": "link",
}

_CATEGORY_THEMES = {
    "FII": ("#312e81", "#4f46e5", "FII"),
    "Ação": ("#0f172a", "#2563eb", "AÇÃO"),
    "Internacional": ("#0c4a6e", "#0284c7", "USD"),
    "Renda Fixa": ("#064e3b", "#059669", "RF"),
    "Reserva": ("#134e4a", "#0d9488", "RES"),
    "Cripto": ("#78350f", "#d97706", "CRIPTO"),
    "Opções": ("#4c1d95", "#7c3aed", "OPÇ"),
}


def _safe_cache_key(ticker: str) -> str:
    return re.sub(r'[^A-Za-z0-9._-]', '_', ticker.upper().strip())


def _lookup_asset_meta(ticker: str) -> tuple[str, str, str]:
    """Retorna (category_name, asset_name, currency) do banco se existir."""
    try:
        from db.session import Session
        from db.models import Asset
        from sqlalchemy.orm import selectinload
        with Session() as session:
            asset = (
                session.query(Asset)
                .options(selectinload(Asset.category))
                .filter(Asset.ticker.ilike(ticker))
                .first()
            )
            if asset:
                cat = asset.category.name if asset.category else ""
                return cat, (asset.name or ""), (asset.currency or "BRL")
    except Exception as exc:
        logging.debug(f"Lookup local asset icon {ticker}: {exc}")
    return "", "", "BRL"


def _fetch_google_favicon(domain: str) -> tuple[bytes, str] | None:
    try:
        url = f"https://www.google.com/s2/favicons?sz=128&domain={domain}"
        res = requests.get(url, timeout=4)
        if res.status_code == 200 and len(res.content) > 300:
            ctype = res.headers.get("content-type", "image/png").split(";")[0].strip()
            return res.content, ctype
    except Exception as exc:
        logging.debug(f"Google favicon fallback {domain}: {exc}")
    return None


def _fetch_brapi_svg(ticker: str) -> tuple[bytes, str] | None:
    candidates = [ticker]
    m = re.match(r'^([A-Z]{4})\d{1,2}$', ticker)
    if m and not ticker.endswith("11"):
        root = m.group(1)
        for suffix in ("4", "3", "11"):
            if f"{root}{suffix}" not in candidates:
                candidates.append(f"{root}{suffix}")
    for cand in candidates:
        try:
            url = f"https://icons.brapi.dev/icons/{cand}.svg"
            res = requests.get(url, timeout=4)
            if res.status_code == 200 and b"<svg" in res.content[:512].lower():
                return res.content, "image/svg+xml"
        except Exception as exc:
            logging.debug(f"Brapi svg fallback {cand}: {exc}")
    return None


def _fetch_crypto_icon(ticker: str) -> tuple[bytes, str] | None:
    clean = ticker.replace("-USD", "").replace("-BRL", "").strip()
    sym = _CRYPTO_ALIASES.get(clean, clean.lower())
    try:
        url = f"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/{sym}.png"
        res = requests.get(url, timeout=4)
        if res.status_code == 200 and len(res.content) > 200:
            return res.content, "image/png"
    except Exception as exc:
        logging.debug(f"Crypto icon fallback {sym}: {exc}")
    return None

def _fetch_us_stock_icon(ticker: str) -> tuple[bytes, str] | None:
    try:
        url = f"https://financialmodelingprep.com/image-stock/{ticker}.png"
        res = requests.get(url, timeout=4)
        ctype = res.headers.get("content-type", "")
        if res.status_code == 200 and ctype.startswith("image/") and len(res.content) > 500:
            return res.content, ctype.split(";")[0].strip()
    except Exception as exc:
        logging.debug(f"US stock icon fallback {ticker}: {exc}")
    return None


def _fetch_yfinance_favicon(ticker: str, category: str) -> tuple[bytes, str] | None:
    try:
        import yfinance as yf
        from utils.ticker_helper import to_yf_ticker
        yf_t = to_yf_ticker(ticker, category or "Ação")
        info = yf.Ticker(yf_t).info or {}
        website = info.get("website")
        if website:
            domain = urlparse(website).netloc.replace("www.", "")
            if domain:
                return _fetch_google_favicon(domain)
    except Exception as e:
        logging.debug(f"YFinance favicon falhou para {ticker}: {e}")
    return None


def _build_svg_badge(ticker: str, category: str) -> bytes:
    """Gera um ícone SVG nítido e moderno com gradiente por categoria."""
    c1, c2, tag = _CATEGORY_THEMES.get(category, ("#1e293b", "#3b82f6", ""))
    words = [w for w in re.split(r'[\s_-]+', ticker) if w]
    if len(words) >= 2:
        label = "".join(w[0] for w in words[:3]).upper()
    elif ticker.endswith("11") and len(ticker) >= 6:
        label = ticker[:4]
    else:
        label = ticker[:4]

    font_size = 34 if len(label) <= 3 else 28
    safe_label = html.escape(label)
    safe_tag = html.escape(tag)
    tag_el = (
        f'<text x="64" y="98" text-anchor="middle" fill="rgba(255,255,255,0.68)" '
        f'font-family="Inter,system-ui,-apple-system,sans-serif" font-size="14" font-weight="700" '
        f'letter-spacing="1.5">{safe_tag}</text>'
        if safe_tag else ""
    )
    y_main = "64" if safe_tag else "74"
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">'
        f'<defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">'
        f'<stop offset="0%" stop-color="{c1}"/><stop offset="100%" stop-color="{c2}"/>'
        f'</linearGradient></defs>'
        f'<rect width="128" height="128" rx="64" fill="url(#g)"/>'
        f'<circle cx="64" cy="64" r="61" fill="none" stroke="rgba(255,255,255,0.16)" stroke-width="2"/>'
        f'<text x="64" y="{y_main}" text-anchor="middle" dominant-baseline="middle" fill="#ffffff" '
        f'font-family="Inter,system-ui,-apple-system,sans-serif" font-size="{font_size}" '
        f'font-weight="800" letter-spacing="0.5">{safe_label}</text>'
        f'{tag_el}'
        f'</svg>'
    )
    return svg.encode("utf-8")


def _resolve_external_icon(ticker: str, category: str, name: str, currency: str) -> tuple[bytes, str] | None:
    haystack = f"{ticker} {name}".lower()

    if category in ("Reserva", "Renda Fixa"):
        for kw, domain in _BANK_DOMAINS.items():
            if kw in haystack:
                res = _fetch_google_favicon(domain)
                if res:
                    return res

    if category == "Cripto" or ticker in _CRYPTO_ALIASES or ticker.endswith("-USD"):
        res = _fetch_crypto_icon(ticker)
        if res:
            return res

    if category == "Internacional" or currency == "USD":
        res = _fetch_us_stock_icon(ticker)
        if res:
            return res

    if category in ("", "Ação", "FII", "ETF", "BDR", "Renda Fixa") or currency == "BRL" or ticker.endswith("11"):
        res = _fetch_brapi_svg(ticker)
        if res:
            return res

    for kw, domain in _BANK_DOMAINS.items():
        if kw in haystack:
            res = _fetch_google_favicon(domain)
            if res:
                return res

    if category not in ("Reserva", "Renda Fixa", "Opções"):
        res = _fetch_yfinance_favicon(ticker, category)
        if res:
            return res

    return None


def _is_safe_svg(content: bytes) -> bool:
    low = content[:16384].lower()
    dangerous = (b"<script", b"javascript:", b"onload=", b"onerror=", b"onclick=", b"<foreignobject", b"<iframe")
    return not any(tok in low for tok in dangerous)


@assets_icon_bp.route('/api/assets/icon/<path:ticker>', methods=['GET'])
def get_asset_icon(ticker):
    """
    Retorna o ícone do ativo com prioridade:
    1. Cache local v2 (/app/data/icons/v2)
    2. Fontes modernas por tipo (Bancos/Caixinhas, Crypto, Brapi SVG B3, FMP US, Google Favicon)
    3. Fallback SVG vetorial nítido por categoria
    """
    ticker = ticker.upper().strip()
    if not re.fullmatch(r"[A-Z0-9.\-^ ]{1,24}", ticker):
        return Response(b"Invalid ticker", status=400, mimetype="text/plain")
    safe_key = _safe_cache_key(ticker)

    svg_sec_headers = {
        'Cache-Control': 'public, max-age=86400',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        'X-Content-Type-Options': 'nosniff',
    }
    for ext, mime in (("svg", "image/svg+xml"), ("png", "image/png"), ("jpg", "image/jpeg")):
        cached_path = os.path.join(ICONS_DIR, f"{safe_key}.{ext}")
        if os.path.exists(cached_path):
            with open(cached_path, "rb") as f:
                data = f.read()
                if ext == "svg" and not _is_safe_svg(data):
                    break
                hdrs = svg_sec_headers if ext == "svg" else {'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff'}
                return Response(data, mimetype=mime, headers=hdrs)

    category, name, currency = _lookup_asset_meta(ticker)
    is_known_asset = bool(category or name)
    resolved = _resolve_external_icon(ticker, category, name, currency) if is_known_asset or len(ticker) <= 10 else None
    if resolved:
        content, mime = resolved
        if "svg" in mime and not _is_safe_svg(content):
            resolved = None
    if resolved:
        content, mime = resolved
        ext = "svg" if "svg" in mime else ("jpg" if "jpeg" in mime else "png")
        try:
            # Cap unauthenticated disk writes to known portfolio/radar assets or small cache
            if is_known_asset or len(os.listdir(ICONS_DIR)) < 500:
                with open(os.path.join(ICONS_DIR, f"{safe_key}.{ext}"), "wb") as f:
                    f.write(content)
        except OSError as exc:
            logging.debug(f"Falha ao gravar cache local do ícone {ticker}: {exc}")
        hdrs = svg_sec_headers if ext == "svg" else {'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff'}
        return Response(content, mimetype=mime, headers=hdrs)

    svg_badge = _build_svg_badge(ticker, category)
    return Response(
        svg_badge,
        mimetype='image/svg+xml',
        headers={
            'Cache-Control': 'public, max-age=3600',
            'Content-Security-Policy': "default-src 'none'; sandbox",
            'X-Content-Type-Options': 'nosniff',
        },
    )
