"""
server/domain/portfolio/xirr.py
Cálculo de Taxa Interna de Retorno Ponderada pelo Dinheiro (XIRR), Retorno Simples,
TWR aproximado (Modified Dietz encadeado) e comparação com CDI, IBOV e IPCA.
"""
import json
import logging
from datetime import date, datetime, timedelta
from typing import Iterable, List, Optional, Tuple

import requests

from db.models import AssetTransaction, Dividend, Position, SystemCache, get_active_positions
from domain.portfolio.attribution import calculate_monthly_attribution

CDI_FALLBACK_ANNUAL = 0.1050


def _to_date(val) -> Optional[date]:
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.date()
    if isinstance(val, date):
        return val
    if isinstance(val, str):
        try:
            return datetime.strptime(val.split(" ")[0][:10], "%Y-%m-%d").date()
        except Exception:
            return None
    return None


def calculate_xirr(cashflows: Iterable[Tuple[date, float]], max_iter: int = 100) -> Optional[float]:
    """
    Calcula a TIR anualizada (XIRR) para fluxos com datas irregulares.
    Convenção: aportes negativos, resgates/proventos/valor final positivos.
    Retorna taxa decimal anualizada (ex.: 0.145 = 14.5% a.a.) ou None se indeterminada.
    """
    normalized: List[Tuple[date, float]] = []
    for dt, amt in cashflows:
        d = _to_date(dt)
        if d is None:
            continue
        val = float(amt)
        if val != 0.0:
            normalized.append((d, val))

    if len(normalized) < 2:
        return None

    has_pos = any(a > 0 for _, a in normalized)
    has_neg = any(a < 0 for _, a in normalized)
    if not (has_pos and has_neg):
        return None

    normalized.sort(key=lambda x: x[0])
    d0 = normalized[0][0]
    total_days = (normalized[-1][0] - d0).days
    if total_days <= 0:
        return None

    # Evita explosão numérica em horizontes muito curtos (< 7 dias): ainda calcula com expoente exato
    years = [((d - d0).days / 365.0, amt) for d, amt in normalized]

    def npv(rate: float) -> float:
        base = 1.0 + rate
        if base <= 1e-9:
            return float("inf")
        return sum(amt * (base ** (-t)) for t, amt in years)

    def d_npv(rate: float) -> float:
        base = 1.0 + rate
        if base <= 1e-9:
            return float("nan")
        return sum(-t * amt * (base ** (-t - 1.0)) for t, amt in years)

    for guess in (0.12, 0.0, 0.35, -0.25, 0.8):
        rate = guess
        for _ in range(max_iter):
            f_val = npv(rate)
            if abs(f_val) < 1e-6:
                if -0.999 <= rate <= 100.0:
                    return rate
                break
            deriv = d_npv(rate)
            if not deriv or deriv != deriv or abs(deriv) < 1e-12:
                break
            next_rate = rate - f_val / deriv
            if next_rate <= -0.999:
                next_rate = (rate - 0.999) / 2.0
            elif next_rate > 100.0:
                next_rate = 100.0
            if abs(next_rate - rate) < 1e-9 and abs(npv(next_rate)) < 1e-4:
                return next_rate
            rate = next_rate

    # Fallback determinístico por bisseção
    low, high = -0.995, 25.0
    f_low, f_high = npv(low), npv(high)
    if f_low * f_high > 0:
        return None
    for _ in range(120):
        mid = (low + high) / 2.0
        f_mid = npv(mid)
        if abs(f_mid) < 1e-6 or abs(high - low) < 1e-8:
            return mid
        if f_low * f_mid <= 0:
            high, f_high = mid, f_mid
        else:
            low, f_low = mid, f_mid
    return (low + high) / 2.0


def get_cdi_period_return(session, start_date: date, end_date: date) -> Tuple[float, str]:
    """
    Calcula o CDI acumulado (%) no intervalo [start_date, end_date] via BCB SGS 12
    com cache diário de 24h e fallback determinístico offline.
    """
    days = max(1, (end_date - start_date).days)
    cache_key = f"bcb_sgs_12_cdi_{start_date.strftime('%Y%m%d')}_{end_date.strftime('%Y%m%d')}"
    cached = session.query(SystemCache).filter_by(key=cache_key).first()
    if cached and cached.value and cached.updated_at and (datetime.now() - cached.updated_at) < timedelta(hours=24):
        try:
            payload = json.loads(cached.value)
            return float(payload["pct"]), "bcb_cache"
        except Exception as exc:
            logging.debug(f"Cache CDI inválido (bcb_cache): {exc}")

    # BCB SGS série diária aceita janelas de até ~10 anos; ajusta start_date se exceder
    query_start = max(start_date, end_date - timedelta(days=3600))
    try:
        url = (
            "https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados"
            f"?formato=json&dataInicial={query_start.strftime('%d/%m/%Y')}"
            f"&dataFinal={end_date.strftime('%d/%m/%Y')}"
        )
        res = requests.get(url, timeout=4.0)
        if res.status_code == 200:
            rows = res.json()
            if isinstance(rows, list) and rows:
                factor = 1.0
                for item in rows:
                    factor *= (1.0 + float(item["valor"]) / 100.0)
                pct = round((factor - 1.0) * 100.0, 2)
                serialized = json.dumps({"pct": pct})
                if cached:
                    cached.value = serialized
                    cached.updated_at = datetime.now()
                else:
                    session.add(SystemCache(key=cache_key, value=serialized, updated_at=datetime.now()))
                try:
                    session.commit()
                except Exception:
                    session.rollback()
                return pct, "bcb_live"
    except Exception as exc:
        logging.warning(f"BCB SGS 12 indisponível, usando fallback CDI: {exc}")

    if cached and cached.value:
        try:
            payload = json.loads(cached.value)
            return float(payload["pct"]), "bcb_stale_cache"
        except Exception as exc:
            logging.debug(f"Cache CDI inválido (bcb_stale_cache): {exc}")

    try:
        from domain.quant.helpers import get_risk_free_rate
        annual_rate = get_risk_free_rate()
    except Exception:
        annual_rate = CDI_FALLBACK_ANNUAL
    fallback_pct = round((((1.0 + annual_rate) ** (days / 365.0)) - 1.0) * 100.0, 2)
    return fallback_pct, "fallback"


def get_ibov_period_return(start_date: date, end_date: date, session=None) -> Optional[float]:
    """Obtém variação acumulada (%) do IBOVESPA (^BVSP) entre start_date e end_date."""
    cache_key = f"ibov_bvsp_{start_date.strftime('%Y%m%d')}_{end_date.strftime('%Y%m%d')}"
    if session is not None:
        try:
            cached = session.query(SystemCache).filter_by(key=cache_key).first()
            if cached and cached.value and cached.updated_at and (datetime.now() - cached.updated_at) < timedelta(hours=24):
                payload = json.loads(cached.value)
                return float(payload["pct"])
        except Exception as exc:
            logging.debug(f"Cache IBOV inválido: {exc}")

    try:
        from infrastructure.price_cache import fetch_price_history
        days = (end_date - start_date).days
        period = "1y" if days <= 360 else ("2y" if days <= 720 else ("5y" if days <= 1800 else "max"))
        df = fetch_price_history(["^BVSP"], period=period)
        if df is None or df.empty:
            return None

        if "^BVSP" in df.columns:
            series = df["^BVSP"]["Close"] if isinstance(df["^BVSP"], type(df)) and "Close" in df["^BVSP"] else df["^BVSP"]
        elif hasattr(df.columns, "levels") and "Close" in df.columns.get_level_values(0):
            close_df = df.xs("Close", axis=1, level=0)
            series = close_df["^BVSP"] if "^BVSP" in close_df.columns else close_df.iloc[:, 0]
        elif hasattr(df.columns, "levels") and "Close" in df.columns.get_level_values(1):
            close_df = df.xs("Close", axis=1, level=1)
            series = close_df["^BVSP"] if "^BVSP" in close_df.columns else close_df.iloc[:, 0]
        else:
            series = df["Close"] if "Close" in df.columns else df.iloc[:, 0]

        series = series.dropna()
        if series.empty:
            return None
        series.index = series.index.tz_localize(None) if getattr(series.index, "tz", None) else series.index
        filtered = series[series.index.date >= start_date]
        if filtered.empty:
            filtered = series
        if len(filtered) < 2:
            return 0.0
        p0 = float(filtered.iloc[0])
        p1 = float(filtered.iloc[-1])
        if p0 <= 0:
            return None
        pct = round(((p1 / p0) - 1.0) * 100.0, 2)
        if session is not None:
            try:
                serialized = json.dumps({"pct": pct})
                rec = session.query(SystemCache).filter_by(key=cache_key).first()
                if rec:
                    rec.value = serialized
                    rec.updated_at = datetime.now()
                else:
                    session.add(SystemCache(key=cache_key, value=serialized, updated_at=datetime.now()))
                session.commit()
            except Exception as exc:
                session.rollback()
                logging.debug(f"Falha ao gravar cache IBOV: {exc}")
        return pct
    except Exception as exc:
        logging.warning(f"IBOV indisponível para benchmark: {exc}")
        return None


def _current_portfolio_equity(session, user_id: int) -> float:
    positions: List[Position] = get_active_positions(session, user_id).all()
    if not positions:
        return 0.0

    usd_rate = 5.5
    try:
        from services import PortfolioService
        usd_rate = float(PortfolioService().get_usd_rate() or 5.5)
    except Exception as exc:
        logging.debug(f"Fallback USD rate no equity atual: {exc}")

    total = 0.0
    for pos in positions:
        asset = pos.asset
        if not asset or not pos.quantity or float(pos.quantity) <= 0:
            continue
        mdata = asset.market_data[0] if asset.market_data else None
        price = float(mdata.price) if (mdata and mdata.price) else float(pos.average_price or 0.0)
        factor = usd_rate if asset.currency == "USD" else 1.0
        total += float(pos.quantity) * price * factor
    return round(total, 2)


def calculate_portfolio_returns(session, user_id: int) -> dict:
    """
    Consolida KPIs reais de rentabilidade (XIRR anualizada, ROI simples, TWR Modified Dietz,
    Retorno Real acima da inflação e comparação contra CDI/IBOV/IPCA).
    """
    txs = (
        session.query(AssetTransaction.type, AssetTransaction.total_value, AssetTransaction.transaction_date)
        .filter(
            AssetTransaction.user_id == user_id,
            AssetTransaction.type.in_(["BUY", "SELL"]),
        )
        .order_by(AssetTransaction.transaction_date.asc())
        .all()
    )

    if not txs:
        return {
            "status": "Sucesso",
            "has_data": False,
            "days": 0,
            "is_short_horizon": False,
            "patrimonio_atual": 0.0,
            "xirr_aa_pct": None,
            "xirr_periodo_pct": None,
            "xirr_real_aa_pct": None,
            "twr_pct": None,
            "roi_simples_pct": None,
            "benchmarks": {
                "cdi_pct": None,
                "cdi_source": "none",
                "ibov_pct": None,
                "ipca_pct": None,
                "pct_cdi": None,
            },
            "cashflow_summary": {
                "total_compras": 0.0,
                "total_vendas": 0.0,
                "total_dividendos": 0.0,
                "aporte_liquido": 0.0,
            },
        }

    today = date.today()
    cashflows: List[Tuple[date, float]] = []
    total_compras = 0.0
    total_vendas = 0.0
    first_date: Optional[date] = None

    for tx_type, total_val, tx_date in txs:
        dt = _to_date(tx_date)
        val = float(total_val or 0.0)
        if dt is None or val <= 0:
            continue
        if first_date is None or dt < first_date:
            first_date = dt
        if tx_type == "BUY":
            total_compras += val
            cashflows.append((dt, -val))
        else:
            total_vendas += val
            cashflows.append((dt, val))

    divs = (
        session.query(Dividend.total_value, Dividend.date_payment, Dividend.date_com)
        .filter(Dividend.user_id == user_id)
        .all()
    )
    total_dividendos = 0.0
    for total_val, dt_pay, dt_com in divs:
        dt = _to_date(dt_pay or dt_com)
        val = float(total_val or 0.0)
        if dt is None or val <= 0 or dt > today:
            continue
        total_dividendos += val
        cashflows.append((dt, val))

    patrimonio_atual = _current_portfolio_equity(session, user_id)
    if patrimonio_atual > 0:
        cashflows.append((today, patrimonio_atual))

    first_date = first_date or today
    days = max(1, (today - first_date).days)

    ret_cache_key = (
        f"portfolio_returns_v1_{user_id}_{today.isoformat()}_{len(txs)}_{len(divs)}_"
        f"{round(total_compras, 2)}_{round(total_vendas, 2)}_{round(total_dividendos, 2)}_{round(patrimonio_atual, 2)}"
    )
    try:
        cached_ret = session.query(SystemCache).filter_by(key=ret_cache_key).first()
        if cached_ret and cached_ret.value and cached_ret.updated_at and (datetime.now() - cached_ret.updated_at) < timedelta(hours=6):
            return json.loads(cached_ret.value)
    except Exception as exc:
        logging.debug(f"Cache portfolio_returns inválido: {exc}")

    xirr_rate = calculate_xirr(cashflows)
    xirr_aa_pct = round(xirr_rate * 100.0, 2) if xirr_rate is not None else None
    xirr_periodo_pct = (
        round((((1.0 + xirr_rate) ** (days / 365.0)) - 1.0) * 100.0, 2)
        if xirr_rate is not None and (1.0 + xirr_rate) > 0
        else None
    )

    roi_simples_pct = (
        round(((patrimonio_atual + total_vendas + total_dividendos - total_compras) / total_compras) * 100.0, 2)
        if total_compras > 0
        else 0.0
    )

    # Chain-linked Modified Dietz (TWR aproximado) + IPCA acumulado da série mensal
    attribution = calculate_monthly_attribution(session, user_id)
    twr_factor = 1.0
    has_twr = False
    twr_clamped_months = 0
    for row in attribution.get("series", []):
        v0 = float(row.get("patrimonio_inicio", 0.0))
        v1 = float(row.get("patrimonio_fim", 0.0))
        cf = float(row.get("aportes_liquidos", 0.0))
        d = float(row.get("dividendos", 0.0))
        denom = v0 + 0.5 * cf
        if denom > 1.0:
            r_m_raw = (v1 - v0 - cf + d) / denom
            r_m = max(-0.95, min(r_m_raw, 5.0))
            if r_m != r_m_raw:
                twr_clamped_months += 1
            twr_factor *= (1.0 + r_m)
            has_twr = True
    twr_pct = round((twr_factor - 1.0) * 100.0, 2) if has_twr else None

    cdi_pct, cdi_source = get_cdi_period_return(session, first_date, today)
    ibov_pct = get_ibov_period_return(first_date, today, session=session)
    ipca_pct = float(attribution.get("summary", {}).get("ipca_acumulado_pct", 0.0))

    # Taxa real anualizada pelo efeito Fisher (comparando XIRR a.a. vs IPCA anualizado)
    ipca_factor = 1.0 + (ipca_pct / 100.0)
    ipca_aa = (ipca_factor ** (365.0 / days)) - 1.0 if ipca_factor > 0 and days > 0 else 0.0
    xirr_real_aa_pct = (
        round((((1.0 + xirr_rate) / (1.0 + ipca_aa)) - 1.0) * 100.0, 2)
        if xirr_rate is not None and (1.0 + ipca_aa) > 0
        else None
    )

    pct_cdi = (
        round((xirr_periodo_pct / cdi_pct) * 100.0, 1)
        if xirr_periodo_pct is not None and cdi_pct and cdi_pct > 0
        else None
    )

    result_dict = {
        "status": "Sucesso",
        "has_data": True,
        "start_date": first_date.isoformat(),
        "end_date": today.isoformat(),
        "days": days,
        "is_short_horizon": days < 90,
        "patrimonio_atual": patrimonio_atual,
        "xirr_aa_pct": xirr_aa_pct,
        "xirr_periodo_pct": xirr_periodo_pct,
        "xirr_real_aa_pct": xirr_real_aa_pct,
        "twr_pct": twr_pct,
        "twr_clamped_months": twr_clamped_months,
        "roi_simples_pct": roi_simples_pct,
        "benchmarks": {
            "cdi_pct": cdi_pct,
            "cdi_source": cdi_source,
            "ibov_pct": ibov_pct,
            "ipca_pct": ipca_pct,
            "pct_cdi": pct_cdi,
        },
        "cashflow_summary": {
            "total_compras": round(total_compras, 2),
            "total_vendas": round(total_vendas, 2),
            "total_dividendos": round(total_dividendos, 2),
            "aporte_liquido": round(total_compras - total_vendas, 2),
        },
    }
    try:
        serialized_ret = json.dumps(result_dict)
        rec = session.query(SystemCache).filter_by(key=ret_cache_key).first()
        if rec:
            rec.value = serialized_ret
            rec.updated_at = datetime.now()
        else:
            session.add(SystemCache(key=ret_cache_key, value=serialized_ret, updated_at=datetime.now()))
        session.commit()
    except Exception as exc:
        session.rollback()
        logging.debug(f"Falha ao gravar cache portfolio_returns: {exc}")
    return result_dict
