"""Provedor oficial de cotações do Tesouro Direto (Tesouro Transparente CSV)."""
from __future__ import annotations

import csv
import hashlib
import io
import logging
import re
import threading
import time
import unicodedata
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Optional

import requests

TESOURO_DIRETO_CSV_URL = (
    "https://www.tesourotransparente.gov.br/ckan/dataset/"
    "df56aa42-484a-4a59-8184-7676580c81e3/resource/"
    "796d2059-14e9-44e3-80c9-2d9e30b405c1/download/precotaxatesourodireto.csv"
)

TESOURO_SYMBOL_PREFIX = "TD"
_CACHE_TTL_SECONDS = 6 * 60 * 60
_CACHE_LOCK = threading.Lock()
_LATEST_CACHE: dict = {"ts": 0.0, "quotes": None}


@dataclass(frozen=True)
class TesouroDiretoQuote:
    """Cotação oficial de um título do Tesouro Direto na última Data Base."""

    title_type: str
    maturity_date: date
    price_date: date
    pu_base: Decimal
    taxa_compra: Optional[Decimal] = None
    taxa_venda: Optional[Decimal] = None

    @property
    def ticker(self) -> str:
        return tesouro_ticker_for(self.title_type, self.maturity_date)


def _normalize(value: str) -> str:
    text = unicodedata.normalize("NFKD", value or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", text).strip().casefold()


def _header_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", _normalize(value))


def parse_brl_decimal(value: str) -> Decimal:
    """Converte string decimal pt-BR (ex: '15.130,10') ou padrão em Decimal."""
    raw = str(value or "").strip()
    if not raw:
        raise ValueError("empty decimal")
    if "," in raw:
        raw = raw.replace(".", "").replace(",", ".")
    try:
        return Decimal(raw)
    except InvalidOperation as exc:
        raise ValueError(f"invalid decimal: {value}") from exc


def _parse_optional_decimal(value: str | None) -> Optional[Decimal]:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        return parse_brl_decimal(raw)
    except ValueError:
        return None


def _parse_date(value: str) -> date:
    raw = str(value or "").strip()
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%Y%m%d"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"invalid date: {value}")


def tesouro_ticker_for(title_type: str, maturity_date: date) -> str:
    """Gera ticker compacto <= 20 chars (TD:<6-hex>:<YYYYMMDD>) compatível com Asset.ticker."""
    digest = hashlib.sha1(_normalize(title_type).encode("utf-8")).hexdigest()[:6].upper()
    return f"{TESOURO_SYMBOL_PREFIX}:{digest}:{maturity_date.strftime('%Y%m%d')}"


def is_tesouro_ticker(ticker: str | None) -> bool:
    parts = (ticker or "").strip().upper().split(":")
    return len(parts) == 3 and parts[0] == TESOURO_SYMBOL_PREFIX and len(parts[1]) == 6 and len(parts[2]) == 8


def parse_tesouro_ticker(ticker: str) -> tuple[str, date]:
    parts = (ticker or "").strip().upper().split(":", 2)
    if len(parts) != 3 or parts[0] != TESOURO_SYMBOL_PREFIX or not parts[1]:
        raise ValueError(f"invalid Tesouro Direto ticker: {ticker}")
    return parts[1], _parse_date(parts[2])


def infer_index_and_rate(title_type: str, taxa_compra: Optional[Decimal]) -> tuple[str, Decimal]:
    """Infere o indexador (CDI, IPCA ou PRE) e a taxa padrão do título."""
    norm = _normalize(title_type)
    if "selic" in norm:
        return "CDI", Decimal("100.0")
    if "ipca" in norm or "renda+" in norm or "educa+" in norm:
        return "IPCA", taxa_compra if taxa_compra is not None else Decimal("6.0")
    return "PRE", taxa_compra if taxa_compra is not None else Decimal("12.0")


class TesouroDiretoProvider:
    """Provedor síncrono com cache de 6h para o CSV oficial do Tesouro Transparente."""

    def __init__(self, *, csv_text: str | None = None, url: str = TESOURO_DIRETO_CSV_URL) -> None:
        self._csv_text = csv_text
        self.url = url

    def _download_csv(self) -> str:
        response = requests.get(
            self.url,
            headers={"User-Agent": "AssetFlow TesouroDiretoProvider"},
            timeout=30,
        )
        response.raise_for_status()
        response.encoding = response.encoding or "latin1"
        return response.text

    def _iter_quotes(self, csv_text: str):
        if not csv_text.strip():
            return
        sample = csv_text[:2048]
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=";,\t")
        except csv.Error:
            dialect = csv.excel
        reader = csv.DictReader(io.StringIO(csv_text), dialect=dialect)
        if not reader.fieldnames:
            return
        header_map = {_header_key(name): name for name in reader.fieldnames}
        title_col = header_map.get("tipotitulo")
        maturity_col = header_map.get("datavencimento")
        price_date_col = header_map.get("database")
        pu_col = header_map.get("pubasemanha") or header_map.get("pubase")
        if not pu_col:
            for key, original in header_map.items():
                if key.startswith("pubase"):
                    pu_col = original
                    break
        taxa_compra_col = header_map.get("taxacompramanha") or header_map.get("taxacompra")
        taxa_venda_col = header_map.get("taxavendamanha") or header_map.get("taxavenda")

        if not (title_col and maturity_col and price_date_col and pu_col):
            return

        for row in reader:
            try:
                yield TesouroDiretoQuote(
                    title_type=(row.get(title_col) or "").strip(),
                    maturity_date=_parse_date(row.get(maturity_col) or ""),
                    price_date=_parse_date(row.get(price_date_col) or ""),
                    pu_base=parse_brl_decimal(row.get(pu_col) or ""),
                    taxa_compra=_parse_optional_decimal(row.get(taxa_compra_col) if taxa_compra_col else None),
                    taxa_venda=_parse_optional_decimal(row.get(taxa_venda_col) if taxa_venda_col else None),
                )
            except ValueError:
                continue

    def _build_latest(self, csv_text: str) -> list[TesouroDiretoQuote]:
        latest: dict[tuple[str, date], TesouroDiretoQuote] = {}
        for quote in self._iter_quotes(csv_text):
            key = (_normalize(quote.title_type), quote.maturity_date)
            if key not in latest or quote.price_date > latest[key].price_date:
                latest[key] = quote
        return list(latest.values())

    def get_latest_quotes(self) -> list[TesouroDiretoQuote]:
        if self._csv_text is not None:
            return self._build_latest(self._csv_text)

        now = time.monotonic()
        with _CACHE_LOCK:
            cached = _LATEST_CACHE["quotes"]
            if cached is not None and (now - _LATEST_CACHE["ts"]) < _CACHE_TTL_SECONDS:
                return cached

        csv_text = self._download_csv()
        quotes = self._build_latest(csv_text)
        with _CACHE_LOCK:
            _LATEST_CACHE["quotes"] = quotes
            _LATEST_CACHE["ts"] = time.monotonic()
        return quotes

    def get_available_bonds(self, *, today: Optional[date] = None) -> list[TesouroDiretoQuote]:
        ref_day = today or datetime.now().date()
        bonds = [q for q in self.get_latest_quotes() if q.maturity_date >= ref_day]
        return sorted(bonds, key=lambda q: (q.title_type, q.maturity_date))

    def get_quote_by_ticker(self, ticker: str) -> Optional[TesouroDiretoQuote]:
        try:
            title_hash, maturity_date = parse_tesouro_ticker(ticker)
        except ValueError:
            return None
        for quote in self.get_latest_quotes():
            if quote.maturity_date != maturity_date:
                continue
            if tesouro_ticker_for(quote.title_type, quote.maturity_date).split(":")[1] == title_hash:
                return quote
        return None


def clear_tesouro_cache() -> None:
    """Limpa o cache em memória (útil para testes)."""
    with _CACHE_LOCK:
        _LATEST_CACHE["ts"] = 0.0
        _LATEST_CACHE["quotes"] = None


def get_tesouro_quote_safe(ticker: str) -> Optional[TesouroDiretoQuote]:
    """Busca cotação oficial do Tesouro Direto sem propagar erro de rede."""
    if not is_tesouro_ticker(ticker):
        return None
    try:
        return TesouroDiretoProvider().get_quote_by_ticker(ticker)
    except Exception as exc:
        logging.warning(f"⚠️ Falha ao consultar Tesouro Direto para {ticker}: {exc}")
        return None
