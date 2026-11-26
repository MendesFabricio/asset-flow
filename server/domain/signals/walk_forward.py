"""
server/domain/signals/walk_forward.py
Engine de Backtest Purged Walk-Forward separado por classe de ativo (ACAO_BR, FII, ETF_EXT)
sobre série Total Return (`adj_close_tr`), com Point-in-Time rigoroso (`filing_date <= t`),
embargo de H pregões e clustering de episódios (cooldown = H).
"""
from __future__ import annotations

import logging
import math
from datetime import date, datetime
from typing import Any, Optional

import numpy as np
import pandas as pd

from domain.signals.wilson import (
    Z_90,
    Z_95,
    calibrated_probability,
    classify_confidence_tier,
    wilson_lower_bound,
)


HORIZONS_TRADING_DAYS = {
    30: 21,
    90: 63,
    180: 126,
    365: 252,
}

ASSET_CLASS_BENCHMARK = {
    "ACAO_BR": "^BVSP",
    "FII": "IFIX.SA",
    "ETF_EXT": "^GSPC",
}

ASSET_CLASS_COST_BPS = {
    "ACAO_BR": 25.0,
    "FII": 30.0,
    "ETF_EXT": 35.0,
}

SETUPS_BY_CLASS = {
    "ACAO_BR": ("VALUE_GRAHAM_BAZIN", "QUALITY_GARP", "DEEP_DISCOUNT_OVERSOLD"),
    "FII": ("FII_TIJOLO_PVP_DISCOUNT", "FII_PAPEL_SPREAD_REAL"),
    "ETF_EXT": ("ETF_TREND_PULLBACK", "INTL_FX_MEAN_REVERT"),
}


def infer_signal_asset_class(category_name: str, ticker: str = "") -> str:
    cat = (category_name or "").strip().lower()
    t = (ticker or "").strip().upper()
    if cat == "fii" or (t.endswith("11") and cat not in ("etf", "internacional", "cripto", "ação")):
        return "FII"
    if cat in ("internacional", "etf") or (cat == "" and not t.endswith(("3", "4", "5", "6", "11"))):
        return "ETF_EXT"
    return "ACAO_BR"


def _compute_wilder_rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0.0)
    loss = (-delta).clip(lower=0.0)
    avg_gain = gain.ewm(alpha=1.0 / period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1.0 / period, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0.0, np.nan)
    rsi = 100.0 - (100.0 / (1.0 + rs))
    return rsi.fillna(50.0)


def _match_pit_fundamental(snaps: list, eval_date: date) -> Optional[Any]:
    """Retorna o snapshot fundamentalista mais recente divulgado ANTES OU EM `eval_date` (zero look-ahead)."""
    valid = None
    for s in snaps or []:
        f_dt = getattr(s, "filing_date", None)
        if isinstance(f_dt, datetime):
            f_dt = f_dt.date()
        if f_dt is not None and f_dt <= eval_date:
            valid = s
        else:
            break
    return valid


def _evaluate_setup_trigger(
    setup_code: str,
    price_tr: float,
    rsi: float,
    sma20: float,
    sma50: float,
    sma200: float,
    pit_fund: Optional[Any],
) -> tuple[bool, list[dict]]:
    triggers: list[dict] = []

    if setup_code == "VALUE_GRAHAM_BAZIN":
        if pit_fund is not None and getattr(pit_fund, "pl", None) and getattr(pit_fund, "pvp", None):
            pl = float(pit_fund.pl or 0)
            pvp = float(pit_fund.pvp or 0)
            dy = float(getattr(pit_fund, "div_12m_adj", None) or getattr(pit_fund, "dy_12m", None) or 0)
            cond = (0 < pl <= 12.0 and 0 < pvp <= 1.8 and rsi <= 52.0) or (dy >= 6.0 and rsi <= 46.0)
            if cond:
                triggers.append({"metric": "P/L (PIT)", "actual": f"{pl:.1f}x", "rule": "<= 12x"})
                triggers.append({"metric": "P/VP (PIT)", "actual": f"{pvp:.2f}x", "rule": "<= 1.8x"})
                triggers.append({"metric": "RSI-14 (TR)", "actual": f"{rsi:.1f}", "rule": "<= 52"})
            return cond, triggers
        # Fallback técnico-cíclico sem look-ahead quando PIT ainda não possui balanço histórico
        cond = rsi <= 40.0 and sma50 > 0 and price_tr <= sma50 * 0.96
        if cond:
            triggers.append({"metric": "RSI-14 (TR)", "actual": f"{rsi:.1f}", "rule": "<= 40"})
            triggers.append({"metric": "Desvio SMA50", "actual": f"{((price_tr/sma50)-1)*100:.1f}%", "rule": "<= -4%"})
        return cond, triggers

    if setup_code == "QUALITY_GARP":
        if pit_fund is not None and getattr(pit_fund, "quality_score", None) is not None:
            q_score = int(pit_fund.quality_score or 0)
            roe = float(pit_fund.roe or 0.0)
            cond = q_score >= 65 and roe >= 12.0 and rsi <= 55.0 and (sma200 <= 0 or price_tr >= sma200 * 0.95)
            if cond:
                triggers.append({"metric": "Quality Score (PIT)", "actual": f"{q_score}/100", "rule": ">= 65"})
                triggers.append({"metric": "ROE (PIT)", "actual": f"{roe:.1f}%", "rule": ">= 12%"})
                triggers.append({"metric": "RSI-14 (TR)", "actual": f"{rsi:.1f}", "rule": "<= 55"})
            return cond, triggers
        cond = 38.0 <= rsi <= 52.0 and sma20 > 0 and sma200 > 0 and price_tr > sma200 and price_tr <= sma20
        if cond:
            triggers.append({"metric": "Tendência > SMA200", "actual": "Alta", "rule": "Adj > SMA200"})
            triggers.append({"metric": "Pullback SMA20", "actual": f"{rsi:.1f}", "rule": "RSI 38-52"})
        return cond, triggers

    if setup_code == "DEEP_DISCOUNT_OVERSOLD":
        cond = rsi <= 34.0 and sma20 > 0 and price_tr <= sma20 * 0.95
        if cond:
            triggers.append({"metric": "RSI-14 (TR)", "actual": f"{rsi:.1f}", "rule": "<= 34"})
            triggers.append({"metric": "Desconto vs SMA20", "actual": f"{((price_tr/sma20)-1)*100:.1f}%", "rule": "<= -5%"})
        return cond, triggers

    if setup_code == "FII_TIJOLO_PVP_DISCOUNT":
        if pit_fund is not None and getattr(pit_fund, "pvp", None):
            pvp = float(pit_fund.pvp or 0)
            cond = 0 < pvp <= 0.95 and rsi <= 52.0
            if cond:
                triggers.append({"metric": "P/VP (PIT)", "actual": f"{pvp:.2f}", "rule": "<= 0.95"})
                triggers.append({"metric": "RSI-14 (TR)", "actual": f"{rsi:.1f}", "rule": "<= 52"})
            return cond, triggers
        cond = rsi <= 38.0 and sma50 > 0 and price_tr <= sma50 * 0.96
        if cond:
            triggers.append({"metric": "RSI-14 FII (TR)", "actual": f"{rsi:.1f}", "rule": "<= 38"})
        return cond, triggers

    if setup_code == "FII_PAPEL_SPREAD_REAL":
        if pit_fund is not None and getattr(pit_fund, "pvp", None) and (getattr(pit_fund, "div_12m_adj", None) or getattr(pit_fund, "dy_12m", None)):
            pvp = float(pit_fund.pvp or 0)
            cond = 0 < pvp <= 1.02 and rsi <= 54.0
            if cond:
                triggers.append({"metric": "P/VP Papel (PIT)", "actual": f"{pvp:.2f}", "rule": "<= 1.02"})
                triggers.append({"metric": "RSI-14 (TR)", "actual": f"{rsi:.1f}", "rule": "<= 54"})
            return cond, triggers
        cond = 35.0 <= rsi <= 48.0 and sma20 > 0 and price_tr <= sma20 * 0.985
        if cond:
            triggers.append({"metric": "RSI-14 Papel (TR)", "actual": f"{rsi:.1f}", "rule": "35-48"})
        return cond, triggers

    if setup_code == "ETF_TREND_PULLBACK":
        cond = sma200 > 0 and price_tr > sma200 and rsi <= 44.0 and sma20 > 0 and price_tr <= sma20
        if cond:
            triggers.append({"metric": "Regime > SMA200", "actual": "Alta", "rule": "Adj > SMA200"})
            triggers.append({"metric": "RSI-14 (TR)", "actual": f"{rsi:.1f}", "rule": "<= 44"})
        return cond, triggers

    if setup_code == "INTL_FX_MEAN_REVERT":
        cond = sma50 > 0 and price_tr <= sma50 * 0.95 and rsi <= 42.0
        if cond:
            triggers.append({"metric": "Desvio SMA50", "actual": f"{((price_tr/sma50)-1)*100:.1f}%", "rule": "<= -5%"})
            triggers.append({"metric": "RSI-14 (TR)", "actual": f"{rsi:.1f}", "rule": "<= 42"})
        return cond, triggers

    return False, []


def _summarize_episodes(episodes: list[dict], prior_wlb90: float = 0.50) -> dict:
    n = len(episodes)
    if n == 0:
        return {
            "sample_size_n": 0,
            "oos_sample_n": 0,
            "wins": 0,
            "win_rate": 0.0,
            "wilson_lb_90": 0.0,
            "wilson_lb_95": 0.0,
            "calibrated_prob": 0.50,
            "expectancy_net": 0.0,
            "excess_return_vs_bench": 0.0,
            "profit_factor": 0.0,
            "avg_return": 0.0,
            "median_return": 0.0,
            "max_drawdown_mae": 0.0,
            "oos_consistency_score": 0.0,
        }

    is_eps = [e for e in episodes if not e.get("is_oos")]
    oos_eps = [e for e in episodes if e.get("is_oos")]
    oos_n = len(oos_eps)

    rets = np.array([e["net_return"] for e in episodes], dtype=float)
    excess = np.array([e["excess_return"] for e in episodes], dtype=float)
    maes = np.array([e["mae"] for e in episodes], dtype=float)

    wins_arr = [r for r in rets if r > 0.0]
    losses_arr = [abs(r) for r in rets if r <= 0.0]
    wins_cnt = len(wins_arr)
    win_rate = wins_cnt / float(n)
    wlb_90 = wilson_lower_bound(wins_cnt, n, Z_90)
    wlb_95 = wilson_lower_bound(wins_cnt, n, Z_95)
    cal_prob = calibrated_probability(wins_cnt, n, prior_prob=prior_wlb90)

    avg_win = float(np.mean(wins_arr)) if wins_arr else 0.0
    avg_loss = float(np.mean(losses_arr)) if losses_arr else 0.0
    exp_net = (win_rate * avg_win) - ((1.0 - win_rate) * avg_loss)
    gross_wins = float(np.sum(wins_arr))
    gross_losses = float(np.sum(losses_arr))
    if gross_losses > 1e-6:
        profit_factor = round(gross_wins / gross_losses, 3)
    elif gross_wins > 0:
        profit_factor = 3.0
    else:
        profit_factor = 0.0

    def _exp_of(eps: list[dict]) -> float:
        if not eps:
            return 0.0
        return float(np.mean([e["net_return"] for e in eps]))

    is_exp = _exp_of(is_eps) if is_eps else exp_net
    oos_exp = _exp_of(oos_eps) if oos_eps else exp_net
    if oos_n == 0 or oos_exp <= 0:
        oos_consistency = 0.0
    else:
        degradation = max(0.0, is_exp - oos_exp) / max(0.01, abs(is_exp))
        oos_consistency = max(0.0, min(1.0, 1.0 - degradation))

    mae_p90 = float(np.percentile(maes, 10)) if len(maes) > 0 else 0.0

    return {
        "sample_size_n": n,
        "oos_sample_n": oos_n,
        "wins": wins_cnt,
        "win_rate": round(win_rate, 4),
        "wilson_lb_90": wlb_90,
        "wilson_lb_95": wlb_95,
        "calibrated_prob": cal_prob,
        "expectancy_net": round(exp_net, 4),
        "excess_return_vs_bench": round(float(np.mean(excess)), 4),
        "profit_factor": profit_factor,
        "avg_return": round(float(np.mean(rets)), 4),
        "median_return": round(float(np.median(rets)), 4),
        "max_drawdown_mae": round(mae_p90, 4),
        "oos_consistency_score": round(oos_consistency, 4),
    }


def run_purged_walk_forward_backtest(
    price_frames_by_ticker: dict[str, pd.DataFrame],
    benchmark_series: Optional[pd.Series],
    asset_class: str,
    setup_code: str,
    horizon_days: int = 90,
    fundamentals_by_ticker: Optional[dict[str, list]] = None,
    cost_bps: Optional[float] = None,
    min_is_days: int = 252,
    oos_block_days: int = 126,
) -> dict:
    """
    Executa Purged Walk-Forward sobre `{ticker: DataFrame[adj_close_tr, ...]}`:
    - Janela IS expansiva >= `min_is_days` pregões + Purge de `H` pregões -> Bloco OOS de `oos_block_days`.
    - Cooldown por ticker de `H` pregões (cada disparo é 1 episódio independente).
    - Só consome `FundamentalSnapshot` com `filing_date <= eval_date`.
    """
    h_bars = HORIZONS_TRADING_DAYS.get(horizon_days, max(5, int(round(horizon_days * 21 / 30))))
    roundtrip_cost = (cost_bps if cost_bps is not None else ASSET_CLASS_COST_BPS.get(asset_class, 25.0)) / 10000.0
    funds_map = fundamentals_by_ticker or {}

    all_episodes: list[dict] = []

    for ticker, df in (price_frames_by_ticker or {}).items():
        if df is None or df.empty or "adj_close_tr" not in df.columns:
            continue
        frame = df.sort_index().copy()
        s = frame["adj_close_tr"].astype(float).dropna()
        if len(s) < (min_is_days + h_bars + 20):
            continue

        rsi_s = frame["rsi_14"] if "rsi_14" in frame.columns and frame["rsi_14"].notna().all() else _compute_wilder_rsi(s, 14)
        sma20_s = s.rolling(20, min_periods=20).mean()
        sma50_s = s.rolling(50, min_periods=50).mean()
        sma200_s = s.rolling(200, min_periods=120).mean()

        bench_aligned = (
            benchmark_series.reindex(s.index).ffill()
            if benchmark_series is not None and not benchmark_series.empty
            else None
        )
        tkr_snaps = sorted(
            funds_map.get(ticker, []),
            key=lambda x: getattr(x, "filing_date", date.min),
        )

        # Marca índices OOS pós-embargo em walk-forward expansivo
        n_rows = len(s)
        oos_indices: set[int] = set()
        split_end = min_is_days
        while (split_end + h_bars) < (n_rows - h_bars):
            oos_start = split_end + h_bars
            oos_end = min(n_rows - h_bars, oos_start + oos_block_days)
            for idx_oos in range(oos_start, oos_end):
                oos_indices.add(idx_oos)
            split_end += oos_block_days

        next_allowed_idx = 60  # aguarda aquecimento mínimo de SMA50/RSI
        for idx in range(60, n_rows - h_bars):
            if idx < next_allowed_idx:
                continue
            eval_dt_raw = s.index[idx]
            eval_dt = eval_dt_raw.date() if hasattr(eval_dt_raw, "date") else eval_dt_raw
            px = float(s.iloc[idx])
            if px <= 0:
                continue
            r_val = float(rsi_s.iloc[idx])
            s20 = float(sma20_s.iloc[idx]) if pd.notna(sma20_s.iloc[idx]) else px
            s50 = float(sma50_s.iloc[idx]) if pd.notna(sma50_s.iloc[idx]) else px
            s200 = float(sma200_s.iloc[idx]) if pd.notna(sma200_s.iloc[idx]) else px
            pit_fund = _match_pit_fundamental(tkr_snaps, eval_dt)

            fired, _triggers = _evaluate_setup_trigger(setup_code, px, r_val, s20, s50, s200, pit_fund)
            if not fired:
                continue

            exit_px = float(s.iloc[idx + h_bars])
            gross_ret = (exit_px / px) - 1.0
            net_ret = gross_ret - roundtrip_cost

            bench_ret = 0.0
            if bench_aligned is not None:
                b0 = bench_aligned.iloc[idx]
                b1 = bench_aligned.iloc[idx + h_bars]
                if pd.notna(b0) and pd.notna(b1) and float(b0) > 0:
                    bench_ret = (float(b1) / float(b0)) - 1.0

            window_slice = s.iloc[idx : idx + h_bars + 1]
            min_in_win = float(window_slice.min())
            mae = (min_in_win / px) - 1.0

            all_episodes.append({
                "ticker": ticker,
                "entry_date": eval_dt,
                "is_oos": idx in oos_indices,
                "gross_return": gross_ret,
                "net_return": net_ret,
                "excess_return": net_ret - bench_ret,
                "mae": mae,
            })
            # Cooldown rigoroso = horizonte H para zerar autocorrelação entre sinais consecutivos
            next_allowed_idx = idx + h_bars

    stats = _summarize_episodes(all_episodes)
    stats["setup_code"] = setup_code
    stats["asset_class"] = asset_class
    stats["horizon_days"] = horizon_days
    stats["confidence_tier"] = classify_confidence_tier(
        stats["sample_size_n"],
        stats["oos_sample_n"],
        stats["wilson_lb_90"],
        stats["wilson_lb_95"],
        stats["expectancy_net"],
        stats["profit_factor"],
        stats["oos_consistency_score"],
    )
    return stats


def recalibrate_all_setups(session, horizons: tuple[int, ...] = (30, 90, 180, 365)) -> list[dict]:
    """Recalibra estatísticas Walk-Forward em `signal_setup_stats` sobre dados persistidos em `price_history_daily`."""
    from db.models import Asset, Category, MarketScreenerItem
    from db.models.signals import FundamentalSnapshot, PriceHistoryDaily, SignalSetupStat

    rows = (
        session.query(PriceHistoryDaily)
        .order_by(PriceHistoryDaily.ticker.asc(), PriceHistoryDaily.date.asc())
        .all()
    )
    by_ticker_rows: dict[str, list] = {}
    for r in rows:
        by_ticker_rows.setdefault(r.ticker.upper(), []).append(r)

    frames_by_ticker: dict[str, pd.DataFrame] = {}
    for tkr, items in by_ticker_rows.items():
        df = pd.DataFrame(
            [
                {
                    "date": it.date,
                    "adj_close_tr": float(it.adj_close_tr),
                    "rsi_14": it.rsi_14,
                }
                for it in items
            ]
        ).set_index("date")
        frames_by_ticker[tkr] = df

    # Map tickers to classes via Asset+Category and MarketScreenerItem
    class_map: dict[str, str] = {}
    for asset_row, cat_row in session.query(Asset, Category).outerjoin(Category, Asset.category_id == Category.id).all():
        tkr_u = asset_row.ticker.strip().upper()
        cat_name = cat_row.name if cat_row else ""
        if cat_name in ("Reserva", "Renda Fixa", "Cripto"):
            continue
        class_map[tkr_u] = infer_signal_asset_class(cat_name, tkr_u)

    for scr in session.query(MarketScreenerItem).all():
        tkr_u = scr.ticker.strip().upper()
        if tkr_u not in class_map:
            class_map[tkr_u] = infer_signal_asset_class(scr.asset_type or "", tkr_u)

    funds_by_ticker: dict[str, list] = {}
    for fs in session.query(FundamentalSnapshot).order_by(FundamentalSnapshot.filing_date.asc()).all():
        funds_by_ticker.setdefault(fs.ticker.upper(), []).append(fs)

    updated_stats: list[dict] = []
    now_dt = datetime.now()

    for asset_class, setups in SETUPS_BY_CLASS.items():
        bench_tkr = ASSET_CLASS_BENCHMARK[asset_class]
        bench_df = frames_by_ticker.get(bench_tkr)
        if bench_df is None or bench_df.empty:
            bench_df = frames_by_ticker.get("^BVSP")
        bench_series = bench_df["adj_close_tr"] if (bench_df is not None and not bench_df.empty) else None

        class_frames = {
            tkr: df for tkr, df in frames_by_ticker.items()
            if class_map.get(tkr) == asset_class and not tkr.startswith("^")
        }

        for setup_code in setups:
            for h_days in horizons:
                res = run_purged_walk_forward_backtest(
                    class_frames,
                    bench_series,
                    asset_class=asset_class,
                    setup_code=setup_code,
                    horizon_days=h_days,
                    fundamentals_by_ticker=funds_by_ticker,
                )
                existing = (
                    session.query(SignalSetupStat)
                    .filter_by(
                        setup_code=setup_code,
                        asset_class=asset_class,
                        regime_bucket="GLOBAL",
                        horizon_days=h_days,
                    )
                    .first()
                )
                if not existing:
                    existing = SignalSetupStat(
                        setup_code=setup_code,
                        asset_class=asset_class,
                        regime_bucket="GLOBAL",
                        horizon_days=h_days,
                    )
                    session.add(existing)

                existing.sample_size_n = res["sample_size_n"]
                existing.oos_sample_n = res["oos_sample_n"]
                existing.wins = res["wins"]
                existing.win_rate = res["win_rate"]
                existing.wilson_lb_90 = res["wilson_lb_90"]
                existing.wilson_lb_95 = res["wilson_lb_95"]
                existing.calibrated_prob = res["calibrated_prob"]
                existing.expectancy_net = res["expectancy_net"]
                existing.excess_return_vs_bench = res["excess_return_vs_bench"]
                existing.profit_factor = res["profit_factor"]
                existing.avg_return = res["avg_return"]
                existing.median_return = res["median_return"]
                existing.max_drawdown_mae = res["max_drawdown_mae"]
                existing.oos_consistency_score = res["oos_consistency_score"]
                existing.updated_at = now_dt
                updated_stats.append(res)

    try:
        session.commit()
    except Exception as exc:
        session.rollback()
        logging.error(f"❌ Erro ao persistir SignalSetupStat: {exc}", exc_info=True)
    return updated_stats
