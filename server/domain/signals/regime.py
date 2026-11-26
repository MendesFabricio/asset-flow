"""
server/domain/signals/regime.py
Detector Diário de Regime Macro (Tendência IBOV/IFIX/S&P500 + Direção Selic + Volatilidade EWMA).
"""
from __future__ import annotations

import logging
import math
from datetime import date, datetime, timedelta
from typing import Optional

import numpy as np
import requests


_REGIME_LABELS_PT = {
    "BULL": "Mercado em Alta",
    "SIDEWAYS": "Mercado Lateral",
    "BEAR": "Mercado em Baixa",
    "EASING": "Corte de Juros",
    "STABLE": "Juros Estáveis",
    "TIGHTENING": "Juros em Alta",
    "LOW_VOL": "Volatilidade Baixa",
    "NORMAL_VOL": "Volatilidade Normal",
    "HIGH_VOL": "Volatilidade Alta",
}


def classify_trend_from_series(closes) -> str:
    """Classifica tendência com base em preço vs SMA50 e SMA50 vs SMA200."""
    if closes is None or len(closes) < 50:
        return "SIDEWAYS"
    s = closes.dropna()
    if len(s) < 50:
        return "SIDEWAYS"
    last_px = float(s.iloc[-1])
    sma50 = float(s.iloc[-50:].mean())
    if len(s) >= 200:
        sma200 = float(s.iloc[-200:].mean())
        if last_px > sma50 and sma50 > sma200 * 1.005:
            return "BULL"
        if last_px < sma50 and sma50 < sma200 * 0.995:
            return "BEAR"
        return "SIDEWAYS"
    if last_px > sma50 * 1.02:
        return "BULL"
    if last_px < sma50 * 0.98:
        return "BEAR"
    return "SIDEWAYS"


def classify_vol_regime(log_rets) -> tuple[float, str]:
    """Calcula volatilidade EWMA anualizada 21d e compara contra histórico 1-3y."""
    if log_rets is None or len(log_rets) < 25:
        return 0.18, "NORMAL_VOL"
    r = log_rets.dropna()
    if len(r) < 25:
        return 0.18, "NORMAL_VOL"
    ewma_var = r.ewm(span=21).var().dropna()
    if ewma_var.empty:
        return 0.18, "NORMAL_VOL"
    cur_vol = float(math.sqrt(max(0.0, float(ewma_var.iloc[-1])) * 252.0))
    hist_vols = np.sqrt(np.maximum(0.0, ewma_var.values) * 252.0)
    q33 = float(np.quantile(hist_vols, 0.33))
    q70 = float(np.quantile(hist_vols, 0.70))
    if cur_vol <= q33:
        bucket = "LOW_VOL"
    elif cur_vol >= q70:
        bucket = "HIGH_VOL"
    else:
        bucket = "NORMAL_VOL"
    return round(cur_vol, 4), bucket


def _fetch_selic_trend() -> tuple[float, str]:
    """Consulta meta Selic (BCB SGS 432) nos últimos 100 dias para medir direção."""
    from domain.quant.helpers import get_risk_free_rate
    cur_rate = float(get_risk_free_rate() or 0.105)
    try:
        end_d = date.today()
        start_d = end_d - timedelta(days=110)
        url = (
            "https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados"
            f"?formato=json&dataInicial={start_d.strftime('%d/%m/%Y')}&dataFinal={end_d.strftime('%d/%m/%Y')}"
        )
        res = requests.get(url, timeout=5.0)
        if res.status_code == 200:
            rows = res.json()
            if isinstance(rows, list) and len(rows) >= 2:
                v0 = float(rows[0]["valor"]) / 100.0
                v1 = float(rows[-1]["valor"]) / 100.0
                diff = v1 - v0
                delta_str = "TIGHTENING" if diff > 0.002 else ("EASING" if diff < -0.002 else "STABLE")
                return round(v1, 4), delta_str
    except Exception as exc:
        logging.debug(f"Selic 90d fallback: {exc}")
    return round(cur_rate, 4), "STABLE"


def format_regime_label_pt(composite: str) -> str:
    parts = (composite or "").split("_")
    # Format: BULL_EASING_LOW_VOL or SIDEWAYS_TIGHTENING_NORMAL_VOL
    trend = _REGIME_LABELS_PT.get(parts[0], "Neutro") if parts else "Neutro"
    rate = _REGIME_LABELS_PT.get(parts[1], "Juros Estáveis") if len(parts) > 1 else "Juros Estáveis"
    vol_key = "_".join(parts[2:]) if len(parts) > 2 else "NORMAL_VOL"
    vol = _REGIME_LABELS_PT.get(vol_key, "Volatilidade Normal")
    return f"{trend} · {rate} · {vol}"


def detect_and_persist_market_regime(session, target_date: Optional[date] = None):
    """Detecta o regime macro do dia e persiste em `market_regime_daily`."""
    from db.models.signals import MarketRegimeDaily, PriceHistoryDaily

    ref_date = target_date or date.today()
    selic_annual, selic_delta = _fetch_selic_trend()

    def _load_close_series(tkr: str):
        import pandas as pd
        rows = (
            session.query(PriceHistoryDaily.date, PriceHistoryDaily.adj_close_tr)
            .filter(PriceHistoryDaily.ticker == tkr, PriceHistoryDaily.date <= ref_date)
            .order_by(PriceHistoryDaily.date.asc())
            .all()
        )
        if len(rows) >= 60:
            return pd.Series([float(r[1]) for r in rows], index=[r[0] for r in rows])
        try:
            import yfinance as yf
            hist = yf.Ticker(tkr).history(period="2y", auto_adjust=True)
            if hist is not None and not hist.empty and "Close" in hist.columns:
                return hist["Close"].dropna()
        except Exception as exc:
            logging.debug(f"YF fallback regime {tkr}: {exc}")
        return None

    ibov_s = _load_close_series("^BVSP")
    sp500_s = _load_close_series("^GSPC")
    ifix_s = _load_close_series("IFIX.SA")

    ibov_trend = classify_trend_from_series(ibov_s)
    ifix_trend = classify_trend_from_series(ifix_s) if ifix_s is not None and len(ifix_s) >= 50 else ibov_trend
    sp500_trend = classify_trend_from_series(sp500_s)

    if ibov_s is not None and len(ibov_s) >= 30:
        ibov_log_ret = np.log(ibov_s / ibov_s.shift(1)).dropna()
        ibov_vol_21d, vol_regime = classify_vol_regime(ibov_log_ret)
    else:
        ibov_vol_21d, vol_regime = 0.18, "NORMAL_VOL"

    composite = f"{ibov_trend}_{selic_delta}_{vol_regime}"

    row = session.query(MarketRegimeDaily).filter_by(date=ref_date).first()
    if not row:
        row = MarketRegimeDaily(date=ref_date)
        session.add(row)
    row.ibov_trend = ibov_trend
    row.ifix_trend = ifix_trend
    row.sp500_trend = sp500_trend
    row.selic_annual = selic_annual
    row.selic_delta_90d = selic_delta
    row.ibov_vol_21d = ibov_vol_21d
    row.vol_regime = vol_regime
    row.composite_regime = composite
    try:
        session.flush()
    except Exception:
        pass
    return row


def get_latest_market_regime(session) -> dict:
    from db.models.signals import MarketRegimeDaily
    row = session.query(MarketRegimeDaily).order_by(MarketRegimeDaily.date.desc()).first()
    if not row:
        return {
            "date": date.today().isoformat(),
            "ibov_trend": "SIDEWAYS",
            "ifix_trend": "SIDEWAYS",
            "sp500_trend": "BULL",
            "selic_annual": 0.1125,
            "selic_delta_90d": "STABLE",
            "ibov_vol_21d": 0.18,
            "vol_regime": "NORMAL_VOL",
            "composite_regime": "SIDEWAYS_STABLE_NORMAL_VOL",
            "label": "Mercado Lateral · Juros Estáveis · Volatilidade Normal",
        }
    return {
        "date": row.date.isoformat(),
        "ibov_trend": row.ibov_trend,
        "ifix_trend": row.ifix_trend,
        "sp500_trend": row.sp500_trend,
        "selic_annual": float(row.selic_annual),
        "selic_delta_90d": row.selic_delta_90d,
        "ibov_vol_21d": float(row.ibov_vol_21d),
        "vol_regime": row.vol_regime,
        "composite_regime": row.composite_regime,
        "label": format_regime_label_pt(row.composite_regime),
    }
