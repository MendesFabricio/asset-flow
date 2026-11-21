"""
infrastructure/screener_service.py
Motor de varredura e cache fundamentalista para o Radar B3, Comparador e Valuation.
Reutiliza yfinance, tickers_cache.json e CVMProcessor mantendo chamadas de rede fora da sessão SQLite.
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
import json
import logging
import os
import re
import time
from typing import Optional

import yfinance as yf

from db.models import Asset, Dividend, MarketScreenerItem, Position, safe_commit
from infrastructure.market_data import collect_amortization_12m_map
from domain.valuation.calculator import (
    calculate_bazin_price,
    calculate_dcf_price,
    calculate_gordon_price,
    calculate_graham_price,
    compute_magic_formula_ranks,
    compute_sector_averages,
    evaluate_fundamental_checklist,
)
from utils.ticker_helper import to_yf_ticker

_SECTOR_PT = {
    "Financial Services": "Financeiro & Bancos",
    "Utilities": "Energia & Saneamento",
    "Energy": "Petróleo & Gás",
    "Basic Materials": "Materiais Básicos",
    "Industrials": "Bens Industriais",
    "Consumer Defensive": "Consumo Básico",
    "Consumer Cyclical": "Consumo Cíclico",
    "Healthcare": "Saúde",
    "Technology": "Tecnologia",
    "Communication Services": "Telecom & Mídia",
    "Real Estate": "Imobiliário / FII",
}

_NON_FII_11 = {
    "BOVA11", "IVVB11", "SMAL11", "HASH11", "GOLD11", "NASD11", "SPXI11",
    "B5P211", "IMAB11", "VWRA11", "COIN11", "ETHY11", "DIVO11", "FIXA11",
    "SANB11", "TAEE11", "KLBN11", "SAPR11", "ALUP11", "ENGI11", "BPAC11", "IGTI11",
}

_FII_SEGMENT_FALLBACK = {
    "MXRF11": "Títulos e Valores Mobiliários",
    "KNCR11": "Títulos e Valores Mobiliários",
    "CPTS11": "Títulos e Valores Mobiliários",
    "RECR11": "Títulos e Valores Mobiliários",
    "RBRR11": "Títulos e Valores Mobiliários",
    "MCCI11": "Títulos e Valores Mobiliários",
    "DEVA11": "Títulos e Valores Mobiliários",
    "HCTR11": "Títulos e Valores Mobiliários",
    "BARI11": "Títulos e Valores Mobiliários",
    "VGIR11": "Títulos e Valores Mobiliários",
    "VGIP11": "Títulos e Valores Mobiliários",
    "VGHF11": "Títulos e Valores Mobiliários",
    "RZAK11": "Títulos e Valores Mobiliários",
    "URPR11": "Títulos e Valores Mobiliários",
    "IRDM11": "Títulos e Valores Mobiliários",
    "VGIA11": "Títulos e Valores Mobiliários",
    "RZAG11": "Títulos e Valores Mobiliários",
    "BTAL11": "Títulos e Valores Mobiliários",
    "HGLG11": "Logística",
    "BTLG11": "Logística",
    "VILG11": "Logística",
    "XPLG11": "Logística",
    "LVBI11": "Logística",
    "GGRC11": "Logística",
    "VISC11": "Shoppings",
    "XPML11": "Shoppings",
    "HGBS11": "Shoppings",
    "HSML11": "Shoppings",
    "PVBI11": "Lajes Corporativas",
    "JSRE11": "Lajes Corporativas",
    "KNRI11": "Híbrido / Renda Urbana",
    "HGRU11": "Híbrido / Renda Urbana",
    "ALZR11": "Híbrido / Renda Urbana",
    "RBVA11": "Híbrido / Renda Urbana",
    "TRXF11": "Híbrido / Renda Urbana",
    "RBRF11": "Fundo de Fundos (FoF)",
    "TGAR11": "Desenvolvimento / Terras",
    "RZTR11": "Desenvolvimento / Terras",
}

_DATA_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "data", "tickers_cache.json")
)


def load_b3_universe(extra_assets: Optional[list[tuple[str, str, str]]] = None) -> list[dict]:
    """Carrega o universo B3 (Ações + FIIs) a partir de tickers_cache.json e ativos extras."""
    universe: dict[str, dict] = {}
    if os.path.exists(_DATA_PATH):
        try:
            with open(_DATA_PATH, "r", encoding="utf-8") as f:
                raw = json.load(f)
            for item in raw:
                atype = item.get("type", "")
                if atype not in ("Ação", "FII"):
                    continue
                tkr = str(item.get("ticker", "")).replace(".SA", "").strip().upper()
                if not tkr:
                    continue
                universe[tkr] = {
                    "ticker": tkr,
                    "name": item.get("name") or tkr,
                    "asset_type": atype,
                }
        except Exception as exc:
            logging.warning(f"⚠️ Falha ao ler tickers_cache.json: {exc}")

    for tkr, name, atype in extra_assets or []:
        clean = str(tkr or "").replace(".SA", "").strip().upper()
        if clean and atype in ("Ação", "FII") and clean not in universe:
            universe[clean] = {
                "ticker": clean,
                "name": name or clean,
                "asset_type": atype,
            }

    return list(universe.values())


def _safe_float(val, scale: float = 1.0) -> Optional[float]:
    if val is None:
        return None
    try:
        num = float(val) * scale
        return num if num == num and abs(num) < 1e15 else None
    except (TypeError, ValueError):
        return None


def _safe_pct(val) -> Optional[float]:
    """Normaliza percentual que pode chegar em fração (0.15) ou já em % (15.0)."""
    raw = _safe_float(val)
    if raw is None:
        return None
    scaled = raw * 100.0 if abs(raw) <= 1.5 else raw
    return scaled if abs(scaled) <= 500.0 else None


def _compute_dividend_metrics(
    yf_ticker_obj,
    price: float,
    amort_12m: float = 0.0,
) -> tuple[Optional[float], Optional[float], Optional[float], list[dict]]:
    """Retorna (div_per_share_12m, dy_12m_pct, dy_avg_5y_pct, dividend_history_5y)."""
    try:
        divs = yf_ticker_obj.dividends
        if divs is None or divs.empty or price <= 0:
            return None, None, None, []
        divs = divs.copy()
        if divs.index.tz is not None:
            divs.index = divs.index.tz_localize(None)

        now = datetime.now()
        cutoff_12m = now - timedelta(days=365)
        cutoff_5y = now - timedelta(days=365 * 5)

        raw_div_12m = float(divs[divs.index >= cutoff_12m].sum())
        div_12m = max(0.0, raw_div_12m - max(0.0, float(amort_12m or 0.0)))
        divs_5y = divs[divs.index >= cutoff_5y]
        if not divs_5y.empty:
            first_dt = divs_5y.index.min().to_pydatetime()
            years_span = max(1.0, min(5.0, (now - first_dt).days / 365.25))
            div_avg_annual = float(divs_5y.sum()) / years_span
            yearly_series = divs_5y.groupby(divs_5y.index.year).sum()
            history_5y = [
                {"year": int(yr), "total": round(float(val), 4)}
                for yr, val in yearly_series.items()
                if float(val) > 0
            ][-5:]
        else:
            div_avg_annual = div_12m
            history_5y = []

        dy_12m_pct = (div_12m / price) * 100.0 if div_12m > 0 else 0.0
        dy_5y_pct = (div_avg_annual / price) * 100.0 if div_avg_annual > 0 else dy_12m_pct
        if div_12m <= 0:
            return None, 0.0, round(dy_5y_pct, 2), history_5y
        return div_12m, round(dy_12m_pct, 2), round(dy_5y_pct, 2), history_5y
    except Exception:
        return None, None, None, []


def fetch_ticker_fundamentals(
    ticker: str,
    name: Optional[str] = None,
    asset_type: Optional[str] = None,
    db_overrides: Optional[dict] = None,
) -> Optional[dict]:
    """Busca dados no Yahoo Finance para um ticker B3 e calcula métricas de valuation/checklist."""
    clean_ticker = ticker.strip().upper().replace(".SA", "")
    inferred_type = asset_type or (
        "FII" if (clean_ticker.endswith("11") and clean_ticker not in _NON_FII_11) else "Ação"
    )
    yf_symbol = to_yf_ticker(clean_ticker, inferred_type)

    try:
        yt = yf.Ticker(yf_symbol)
        info = {}
        try:
            info = yt.info or {}
        except Exception:
            info = {}

        if not asset_type and str(info.get("quoteType") or "").upper() == "ETF":
            inferred_type = "ETF"

        price = _safe_float(info.get("currentPrice") or info.get("regularMarketPrice"))
        prev_close = _safe_float(info.get("previousClose") or info.get("regularMarketPreviousClose"))
        if not price:
            try:
                hist = yt.history(period="5d")
                if not hist.empty:
                    closes = hist["Close"].dropna()
                    if not closes.empty:
                        price = float(closes.iloc[-1])
                        if len(closes) >= 2 and not prev_close:
                            prev_close = float(closes.iloc[-2])
            except Exception:
                pass

        if not price or price <= 0:
            return None

        change_pct = ((price - prev_close) / prev_close * 100.0) if (prev_close and prev_close > 0) else 0.0

        ov = db_overrides or {}
        amort_12m = float(ov.get("amort_12m") or 0.0)
        div_ps, dy_12m, dy_5y, div_history_5y = _compute_dividend_metrics(yt, price, amort_12m=amort_12m)
        if div_ps is None and dy_12m is None:
            raw_dy_info = _safe_float(info.get("dividendYield"))
            if raw_dy_info is not None:
                # yfinance pode retornar 0.085 (8.5%) ou 8.5 dependendo da versão/ativo
                dy_norm = raw_dy_info * 100.0 if raw_dy_info < 0.6 else raw_dy_info
                if 0 < dy_norm < 50.0:
                    dy_12m = round(dy_norm, 2)
                    dy_5y = dy_12m
                    div_ps = price * (dy_norm / 100.0)

        lpa = _safe_float(info.get("trailingEps") or info.get("forwardEps"))
        vpa = _safe_float(info.get("bookValue"))
        pl = _safe_float(info.get("trailingPE")) or ((price / lpa) if (lpa and lpa > 0) else None)
        pvp = _safe_float(info.get("priceToBook")) or ((price / vpa) if (vpa and vpa > 0) else None)
        roe = _safe_pct(info.get("returnOnEquity"))
        net_margin = _safe_pct(info.get("profitMargins"))
        ebitda_margin = _safe_pct(info.get("ebitdaMargins"))
        ev_ebitda = _safe_float(info.get("enterpriseToEbitda"))
        payout = _safe_float(info.get("payoutRatio"), scale=100.0)
        if payout is not None and (payout < 0 or payout > 300):
            payout = None

        total_debt = _safe_float(info.get("totalDebt"))
        total_cash = _safe_float(info.get("totalCash")) or 0.0
        ebitda = _safe_float(info.get("ebitda"))
        debt_to_ebitda = (
            ((total_debt - total_cash) / ebitda)
            if (total_debt is not None and ebitda and ebitda > 0)
            else None
        )

        # ROIC aproximado via EBIT / (Patrimônio + Dívida Líquida) ou ROE fallback
        roic = _safe_pct(info.get("returnOnAssets"))

        fcf = _safe_float(info.get("freeCashflow"))
        shares = _safe_float(info.get("sharesOutstanding"))
        fcf_per_share = (fcf / shares) if (fcf and shares and shares > 0) else None
        dcf_is_estimate = False
        if fcf_per_share is None and lpa and lpa > 0:
            # Conservador fallback de FCL/ação (~70% do lucro por ação quando Yahoo omite DFC)
            fcf_per_share = round(lpa * 0.7, 4)
            dcf_is_estimate = True

        # Mescla overrides locais/oficiais CVM do DB (CVM prevalece sobre Yahoo para Ação e FII)
        if ov.get("lpa") and ov["lpa"] > 0:
            lpa = float(ov["lpa"])
            pl = price / lpa
        if ov.get("vpa") and ov["vpa"] > 0:
            vpa = float(ov["vpa"])
            pvp = price / vpa
        if ov.get("local_div_12m") and float(ov["local_div_12m"]) > 0:
            div_ps = float(ov["local_div_12m"])
            dy_12m = round((div_ps / price) * 100.0, 2)
        elif ov.get("dy") and ov["dy"] > 0 and not div_ps and dy_12m is None:
            dy_12m = round(float(ov["dy"]) * 100.0, 2)
            dy_5y = dy_12m
            div_ps = price * float(ov["dy"])
        if ov.get("roe") is not None:
            roe = float(ov["roe"])
        if ov.get("net_margin") is not None and net_margin is None:
            net_margin = float(ov["net_margin"])
        if ov.get("debt_to_ebitda") is not None:
            debt_to_ebitda = float(ov["debt_to_ebitda"])

        desired_dy = 8.0 if inferred_type == "FII" else 6.0
        bazin_price = calculate_bazin_price(div_ps, desired_dy)
        graham_price = calculate_graham_price(lpa, vpa) if inferred_type == "Ação" else None
        gordon_price = (
            calculate_gordon_price(div_ps, required_return_pct=12.0, growth_pct=5.0)
            if (inferred_type == "Ação" and dy_12m is not None and 0 < dy_12m <= 25.0)
            else None
        )
        dcf_price = calculate_dcf_price(fcf_per_share) if inferred_type == "Ação" else None

        raw_sector = info.get("sector") or ("Real Estate" if inferred_type == "FII" else "Outros")
        sector_pt = _SECTOR_PT.get(raw_sector, raw_sector)
        if inferred_type == "FII":
            sector_pt = "Fundos Imobiliários"

        payload = {
            "ticker": clean_ticker,
            "name": name or info.get("shortName") or info.get("longName") or clean_ticker,
            "asset_type": inferred_type,
            "sector": sector_pt,
            "price": round(price, 2),
            "change_percent": round(change_pct, 2),
            "dy_12m": dy_12m,
            "dy_avg_5y": dy_5y,
            "dividend_per_share": round(div_ps, 4) if div_ps else None,
            "lpa": round(lpa, 4) if lpa is not None else None,
            "vpa": round(vpa, 4) if vpa is not None else None,
            "pl": round(pl, 2) if pl is not None else None,
            "pvp": round(pvp, 2) if pvp is not None else None,
            "roe": round(roe, 2) if roe is not None else None,
            "roic": round(roic, 2) if roic is not None else None,
            "net_margin": round(net_margin, 2) if net_margin is not None else None,
            "ebitda_margin": round(ebitda_margin, 2) if ebitda_margin is not None else None,
            "ev_ebitda": round(ev_ebitda, 2) if ev_ebitda is not None else None,
            "debt_to_ebitda": round(debt_to_ebitda, 2) if debt_to_ebitda is not None else None,
            "payout": round(payout, 2) if payout is not None else None,
            "fcf_per_share": round(fcf_per_share, 4) if fcf_per_share is not None else None,
            "bazin_price": bazin_price,
            "graham_price": graham_price,
            "gordon_price": gordon_price,
            "dcf_price": dcf_price,
            "dcf_is_estimate": dcf_is_estimate,
            "bazin_base": "12m",
            "dy_includes_amortization": bool(
                inferred_type == "FII" and not ov.get("local_div_12m") and amort_12m <= 0
            ),
            "leverage_pct": ov.get("leverage_pct"),
            "vacancy_pct": ov.get("vacancy_pct"),
            "segmento": ov.get("segmento") or (_FII_SEGMENT_FALLBACK.get(clean_ticker) if inferred_type == "FII" else None),
            "dividend_history_5y": div_history_5y,
        }

        checklist, quality_score = evaluate_fundamental_checklist(inferred_type, payload)
        payload["checklist"] = checklist
        payload["quality_score"] = quality_score
        return payload
    except Exception as exc:
        logging.debug(f"⚠️ Screener falhou para {clean_ticker}: {exc}")
        return None


def _collect_db_overrides(session, user_id: Optional[int] = None) -> dict[str, dict]:
    """Extrai múltiplos manuais/CVM/FII, dividendos e amortizações locais para enriquecer valuation."""
    overrides: dict[str, dict] = {}
    cutoff_12m = datetime.now() - timedelta(days=365)
    cutoff_12m_date = cutoff_12m.date()
    cutoff_coverage = cutoff_12m_date + timedelta(days=35)
    amort_map = collect_amortization_12m_map(session, cutoff_12m, user_id=user_id)

    div_q = session.query(Dividend)
    if user_id is not None:
        div_q = div_q.filter(Dividend.user_id == user_id)
    local_divs_by_asset: dict[int, list] = {}
    for d in div_q.all():
        local_divs_by_asset.setdefault(d.asset_id, []).append(d)

    assets = session.query(Asset).all()
    for a in assets:
        tkr_upper = a.ticker.upper()
        entry: dict = {}
        if amort_map.get(tkr_upper, 0.0) > 0:
            entry["amort_12m"] = amort_map[tkr_upper]

        asset_divs = local_divs_by_asset.get(a.id) or []
        if asset_divs:
            valid_dates = [d.date_com for d in asset_divs if d.date_com]
            if valid_dates and min(valid_dates) <= cutoff_coverage:
                seen_div_events: set[tuple] = set()
                div_sum = 0.0
                for d in asset_divs:
                    if not d.date_com or d.date_com < cutoff_12m_date:
                        continue
                    dtype = (d.type or "").lower()
                    if "amort" in dtype:
                        continue
                    ev_key = (d.date_com, dtype, round(float(d.value_per_share or 0), 4))
                    if ev_key in seen_div_events:
                        continue
                    seen_div_events.add(ev_key)
                    div_sum += float(d.value_per_share or 0)
                if div_sum > 0:
                    entry["local_div_12m"] = round(div_sum, 4)

        positions = a.positions or []
        pos = next((p for p in positions if user_id is None or p.user_id == user_id), None)
        if pos:
            if pos.manual_lpa and float(pos.manual_lpa) > 0:
                entry["lpa"] = float(pos.manual_lpa)
            if pos.manual_vpa and float(pos.manual_vpa) > 0:
                entry["vpa"] = float(pos.manual_vpa)
            if pos.manual_dy and float(pos.manual_dy) > 0:
                entry["dy"] = float(pos.manual_dy)
            if pos.last_report_type:
                try:
                    rep = json.loads(pos.last_report_type)
                    cred = rep.get("credit_risk") or {}
                    if cred.get("leverage_pct") is not None:
                        entry["leverage_pct"] = float(cred["leverage_pct"])
                    pdf_kpis = rep.get("pdf_kpis") or {}
                    for v_key in ("vacancia_financeira_pct", "vacancia_fisica_pct"):
                        raw_vac = pdf_kpis.get(v_key)
                        if raw_vac is not None:
                            try:
                                v_f = float(raw_vac)
                                if 0.0 <= v_f <= 100.0:
                                    entry["vacancy_pct"] = round(v_f, 2)
                                    break
                            except (TypeError, ValueError):
                                pass
                    fund = rep.get("fundamentalist") or {}
                    seg = (fund.get("ticker_info") or {}).get("segmento")
                    if seg and str(seg).strip() not in ("N/D", "N/A", "None"):
                        entry["segmento"] = str(seg).strip()
                    cards = fund.get("cards_indicadores") or []
                    for card in cards:
                        titulo = card.get("titulo")
                        if titulo == "Passivo Total" and "leverage_pct" not in entry:
                            m_lev = re.search(r"Alavancagem:\s*([-+]?\d+(?:[.,]\d+)?)%", str(card.get("subtitulo", "")))
                            if m_lev:
                                try:
                                    entry["leverage_pct"] = round(float(m_lev.group(1).replace(",", ".")), 2)
                                except ValueError:
                                    pass
                        elif titulo == "ROE" and "roe" not in entry:
                            raw_r = str(card.get("valor_formatado", "")).replace("%", "").replace(",", ".").strip()
                            try:
                                entry["roe"] = round(float(raw_r), 2)
                            except ValueError:
                                pass
                        elif titulo == "Dívida Líquida" and "debt_to_ebitda" not in entry:
                            m_debt = re.search(r"([-+]?\d+(?:[.,]\d+)?)x\s*EBITDA", str(card.get("subtitulo", "")), re.IGNORECASE)
                            if m_debt:
                                try:
                                    entry["debt_to_ebitda"] = round(float(m_debt.group(1).replace(",", ".")), 2)
                                except ValueError:
                                    pass
                        elif titulo == "VPA" and "vpa" not in entry:
                            raw_v = str(card.get("valor_formatado", "")).replace("R$", "").strip()
                            if "," in raw_v:
                                raw_v = raw_v.replace(".", "").replace(",", ".")
                            try:
                                v_num = float(raw_v)
                                if v_num > 0:
                                    entry["vpa"] = v_num
                            except ValueError:
                                pass
                except Exception:
                    pass
        if entry:
            overrides[tkr_upper] = entry

    # Preserva métricas FNet/manuais já salvas no cache do Radar caso o ticker não tenha posição em carteira
    for scr_row in session.query(MarketScreenerItem).all():
        tkr_u = (scr_row.ticker or "").upper()
        if not tkr_u:
            continue
        ent = overrides.setdefault(tkr_u, {})
        raw = scr_row.raw_metrics_json or {}
        if scr_row.asset_type == "FII" and scr_row.vpa and float(scr_row.vpa) > 0 and "vpa" not in ent:
            ent["vpa"] = float(scr_row.vpa)
        if raw.get("leverage_pct") is not None and "leverage_pct" not in ent:
            ent["leverage_pct"] = raw["leverage_pct"]
        if raw.get("vacancy_pct") is not None and "vacancy_pct" not in ent:
            ent["vacancy_pct"] = raw["vacancy_pct"]
        if raw.get("segmento") and "segmento" not in ent:
            ent["segmento"] = raw["segmento"]
        elif scr_row.asset_type == "FII" and "segmento" not in ent and tkr_u in _FII_SEGMENT_FALLBACK:
            ent["segmento"] = _FII_SEGMENT_FALLBACK[tkr_u]

    for tkr_fii, seg_fb in _FII_SEGMENT_FALLBACK.items():
        ent = overrides.setdefault(tkr_fii, {})
        if "segmento" not in ent:
            ent["segmento"] = seg_fb

    return overrides


def _upsert_screener_items(session, fetched_items: list[dict]) -> int:
    magic_ranks = compute_magic_formula_ranks(fetched_items)
    now = datetime.now()
    existing_map = {
        row.ticker: row
        for row in session.query(MarketScreenerItem).all()
    }
    saved = 0
    for item in fetched_items:
        tkr = item["ticker"]
        row = existing_map.get(tkr)
        if not row:
            row = MarketScreenerItem(ticker=tkr)
            session.add(row)
            existing_map[tkr] = row

        for field in (
            "name", "asset_type", "sector", "price", "change_percent",
            "dy_12m", "dy_avg_5y", "dividend_per_share",
            "lpa", "vpa", "pl", "pvp", "roe", "roic",
            "net_margin", "ebitda_margin", "ev_ebitda", "debt_to_ebitda",
            "payout", "fcf_per_share",
            "bazin_price", "graham_price", "gordon_price", "dcf_price",
            "quality_score",
        ):
            setattr(row, field, item.get(field))
        row.magic_score = magic_ranks.get(tkr)
        row.checklist_json = item.get("checklist") or []
        row.raw_metrics_json = {
            "leverage_pct": item.get("leverage_pct"),
            "vacancy_pct": item.get("vacancy_pct"),
            "segmento": item.get("segmento"),
            "dividend_history_5y": item.get("dividend_history_5y") or [],
            "dcf_is_estimate": bool(item.get("dcf_is_estimate", False)),
            "bazin_base": item.get("bazin_base", "12m"),
            "dy_includes_amortization": bool(item.get("dy_includes_amortization", False)),
        }
        row.updated_at = now
        saved += 1

    # Recalcula magic_score global em todo o universo persistido
    all_rows = list(existing_map.values())
    all_dicts = [r.to_dict() for r in all_rows]
    global_magic = compute_magic_formula_ranks(all_dicts)
    for r in all_rows:
        if r.ticker in global_magic:
            r.magic_score = global_magic[r.ticker]

    safe_commit(session)
    return saved


def refresh_b3_screener(session, user_id: Optional[int] = None, limit: Optional[int] = None) -> dict:
    """Atualiza o cache do Radar B3 buscando fundamentos em paralelo via Yahoo Finance."""
    start_ts = time.monotonic()
    overrides = _collect_db_overrides(session, user_id)

    extra = []
    if user_id is not None:
        pos_assets = (
            session.query(Asset)
            .join(Position)
            .filter(Position.user_id == user_id, Position.quantity > 0)
            .all()
        )
        for a in pos_assets:
            cat = a.category.name if a.category else ""
            if cat in ("Ação", "FII"):
                extra.append((a.ticker, a.name, cat))

    universe = load_b3_universe(extra)
    if limit and limit > 0:
        universe = universe[:limit]

    fetched: list[dict] = []
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {
            pool.submit(
                fetch_ticker_fundamentals,
                u["ticker"],
                u["name"],
                u["asset_type"],
                overrides.get(u["ticker"]),
            ): u["ticker"]
            for u in universe
        }
        for fut in as_completed(futures):
            try:
                res = fut.result()
                if res:
                    fetched.append(res)
            except Exception:
                pass

    count = _upsert_screener_items(session, fetched)
    elapsed = round(time.monotonic() - start_ts, 2)
    logging.info(f"📡 [RADAR] Screener B3 atualizado: {count}/{len(universe)} ativos em {elapsed}s.")
    return {"updated": count, "universe_size": len(universe), "elapsed_sec": elapsed}


def get_or_fetch_asset_valuation(
    session,
    ticker: str,
    user_id: Optional[int] = None,
    bazin_dy: Optional[float] = None,
    discount_rate: Optional[float] = None,
    growth_rate: Optional[float] = None,
    terminal_growth: Optional[float] = None,
    force_refresh: bool = False,
) -> Optional[dict]:
    """Obtém valuation completo + checklist + média setorial para um ticker específico."""
    clean_ticker = ticker.strip().upper().replace(".SA", "")
    overrides = _collect_db_overrides(session, user_id)
    asset_obj = session.query(Asset).filter_by(ticker=clean_ticker).first()
    cat_name = asset_obj.category.name if (asset_obj and asset_obj.category) else None

    row = session.query(MarketScreenerItem).filter_by(ticker=clean_ticker).first()
    is_stale = (
        row is None
        or force_refresh
        or (row.updated_at is None)
        or (datetime.now() - row.updated_at > timedelta(hours=12))
    )

    if is_stale:
        fetched = fetch_ticker_fundamentals(
            clean_ticker,
            name=asset_obj.name if asset_obj else None,
            asset_type=cat_name if cat_name in ("Ação", "FII") else None,
            db_overrides=overrides.get(clean_ticker),
        )
        if fetched:
            _upsert_screener_items(session, [fetched])
            row = session.query(MarketScreenerItem).filter_by(ticker=clean_ticker).first()

    if not row:
        return None

    data = row.to_dict()
    default_bazin = 8.0 if data["asset_type"] == "FII" else 6.0
    eff_bazin_dy = float(bazin_dy) if bazin_dy and bazin_dy > 0 else default_bazin
    eff_discount = float(discount_rate) if discount_rate and discount_rate > 0 else 12.5
    eff_growth = float(growth_rate) if growth_rate is not None else 7.0
    eff_term_growth = float(terminal_growth) if terminal_growth is not None else 3.0

    data["bazin_dy_used"] = eff_bazin_dy
    data["bazin_price"] = calculate_bazin_price(data.get("dividend_per_share"), eff_bazin_dy)
    data["graham_price"] = calculate_graham_price(data.get("lpa"), data.get("vpa")) if data["asset_type"] == "Ação" else None
    data["gordon_price"] = (
        calculate_gordon_price(data.get("dividend_per_share"), eff_discount, eff_growth)
        if (data["asset_type"] == "Ação" and data.get("dy_12m") is not None and 0 < float(data["dy_12m"]) <= 25.0)
        else None
    )
    data["dcf_price"] = (
        calculate_dcf_price(
            data.get("fcf_per_share"),
            growth_pct=eff_growth,
            terminal_growth_pct=eff_term_growth,
            discount_rate_pct=eff_discount,
        )
        if data["asset_type"] == "Ação"
        else None
    )

    if data.get("bazin_price") and data["price"] > 0:
        data["margin_bazin_pct"] = round(((data["bazin_price"] - data["price"]) / data["price"]) * 100.0, 2)
    else:
        data["margin_bazin_pct"] = None
    if data.get("graham_price") and data["price"] > 0:
        data["margin_graham_pct"] = round(((data["graham_price"] - data["price"]) / data["price"]) * 100.0, 2)
    if data.get("dcf_price") and data["price"] > 0:
        data["margin_dcf_pct"] = round(((data["dcf_price"] - data["price"]) / data["price"]) * 100.0, 2)
    else:
        data["margin_dcf_pct"] = None

    raw_json = row.raw_metrics_json or {}
    raw_lev = raw_json.get("leverage_pct")
    raw_vac = raw_json.get("vacancy_pct")
    raw_seg = raw_json.get("segmento")
    div_hist_5y = raw_json.get("dividend_history_5y", [])
    eval_input = {**data, "leverage_pct": raw_lev, "vacancy_pct": raw_vac, "segmento": raw_seg}
    checklist, q_score = evaluate_fundamental_checklist(data["asset_type"], eval_input)
    data["checklist"] = checklist
    data["quality_score"] = q_score
    data["vacancy_pct"] = raw_vac
    data["segmento"] = raw_seg
    data["dividend_history_5y"] = div_hist_5y
    data["bazin_base"] = (row.raw_metrics_json or {}).get("bazin_base", "12m") if row.raw_metrics_json else "12m"
    data["dy_includes_amortization"] = bool(
        (row.raw_metrics_json or {}).get("dy_includes_amortization", False)
    ) if row.raw_metrics_json else False

    # Médias setoriais com base nos itens em cache
    all_rows = [r.to_dict() for r in session.query(MarketScreenerItem).all()]
    sector_avgs = compute_sector_averages(all_rows)
    sec_key = f"{data['asset_type']}::{data['sector']}"
    data["sector_average"] = sector_avgs.get(sec_key)
    data["assumptions"] = {
        "bazin_dy": eff_bazin_dy,
        "discount_rate": eff_discount,
        "growth_rate": eff_growth,
        "terminal_growth": eff_term_growth,
    }
    return data
