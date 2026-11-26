"""
server/domain/signals/wilson.py
Inferência estatística conservadora: Limite Inferior de Wilson, Trava de Amostra Mínima,
Shrinkage Beta-Binomial por Regime e Curva de Calibração (Brier Score).
"""
from __future__ import annotations

import math
from typing import Any, Iterable


Z_90 = 1.6448536
Z_95 = 1.9599640
MIN_SAMPLE_N = 20
MIN_OOS_N = 8


def wilson_lower_bound(wins: int, n: int, z: float = Z_95) -> float:
    """Calcula o limite inferior do intervalo de confiança de Wilson para proporções."""
    if n <= 0:
        return 0.0
    wins_clamped = max(0, min(int(wins), int(n)))
    p_hat = wins_clamped / float(n)
    z2 = z * z
    denom = 1.0 + (z2 / n)
    center = p_hat + (z2 / (2.0 * n))
    margin = z * math.sqrt(((p_hat * (1.0 - p_hat)) / n) + (z2 / (4.0 * n * n)))
    return round(max(0.0, min(1.0, (center - margin) / denom)), 4)


def calibrated_probability(
    wins: int,
    n: int,
    prior_prob: float = 0.50,
    prior_strength: float = 10.0,
) -> float:
    """
    Shrinkage Beta-Binomial combinando o histórico no regime específico (wins, n)
    com o prior conservador global (`wilson_lb_90` global quando disponível).
    """
    p0 = max(0.05, min(0.95, float(prior_prob or 0.50)))
    alpha0 = prior_strength * p0
    beta0 = prior_strength * (1.0 - p0)
    num = max(0, int(wins)) + alpha0
    den = max(0, int(n)) + alpha0 + beta0
    return round(num / den, 4) if den > 0 else round(p0, 4)


def classify_confidence_tier(
    sample_size_n: int,
    oos_sample_n: int,
    wilson_lb_90: float,
    wilson_lb_95: float,
    expectancy_net: float,
    profit_factor: float | None,
    oos_consistency_score: float,
) -> str:
    """
    Classifica a confiabilidade estatística de um setup.
    Bloqueia categoricamente selo forte se N < 20 episódios independentes ou OOS < 8.
    """
    if sample_size_n < MIN_SAMPLE_N or oos_sample_n < MIN_OOS_N:
        return "INSUFFICIENT_SAMPLE"

    pf = float(profit_factor) if profit_factor is not None else 0.0
    if (
        sample_size_n >= 30
        and oos_sample_n >= 12
        and wilson_lb_95 >= 0.55
        and expectancy_net > 0.0
        and pf >= 1.30
        and oos_consistency_score >= 0.70
    ):
        return "ALTA_CERTEZA"

    if wilson_lb_90 >= 0.50 and expectancy_net > 0.0 and pf >= 1.05:
        return "MODERADA"

    return "BAIXA"


def compute_brier_and_curve(outcomes: Iterable[Any], num_bins: int = 5) -> dict:
    """
    Computa Brier Score médio e curva de calibração (probabilidade prevista vs taxa observada real)
    sobre registros auditados de `SignalOutcome`Joined com `SignalLedger`.
    """
    pairs: list[tuple[float, int, float]] = []
    for row in outcomes or []:
        if isinstance(row, dict):
            prob = float(row.get("calibrated_prob", 0.5) or 0.5)
            hit = 1 if row.get("hit_excess_bench") else 0
            net_ret = float(row.get("net_return_pct", 0.0) or 0.0)
        elif hasattr(row, "__len__") and len(row) == 2:
            ledger, outcome = row[0], row[1]
            prob = float(getattr(ledger, "calibrated_prob", 0.5) or 0.5)
            hit = 1 if bool(getattr(outcome, "hit_excess_bench", False)) else 0
            net_ret = float(getattr(outcome, "net_return_pct", 0.0) or 0.0)
        else:
            prob = float(getattr(row, "calibrated_prob", 0.5) or 0.5)
            hit = 1 if bool(getattr(row, "hit_excess_bench", False)) else 0
            net_ret = float(getattr(row, "net_return_pct", 0.0) or 0.0)
        pairs.append((max(0.0, min(1.0, prob)), hit, net_ret))

    m = len(pairs)
    if m == 0:
        return {
            "total_audited": 0,
            "brier_score": None,
            "observed_hit_rate": None,
            "avg_net_return_pct": None,
            "calibration_bins": [],
        }

    brier = sum((p - y) ** 2 for p, y, _ in pairs) / m
    obs_hit = sum(y for _, y, _ in pairs) / m
    avg_ret = sum(r for _, _, r in pairs) / m

    step = 1.0 / max(1, num_bins)
    bins_out = []
    for b in range(num_bins):
        lo = b * step
        hi = (b + 1) * step
        in_bin = [
            (p, y) for p, y, _ in pairs
            if (p >= lo and (p < hi or (b == num_bins - 1 and p <= hi)))
        ]
        if not in_bin:
            continue
        bins_out.append({
            "bin_label": f"{int(lo * 100)}–{int(hi * 100)}%",
            "count": len(in_bin),
            "avg_predicted_prob": round(sum(p for p, _ in in_bin) / len(in_bin), 4),
            "observed_hit_rate": round(sum(y for _, y in in_bin) / len(in_bin), 4),
        })

    return {
        "total_audited": m,
        "brier_score": round(brier, 4),
        "observed_hit_rate": round(obs_hit, 4),
        "avg_net_return_pct": round(avg_ret, 2),
        "calibration_bins": bins_out,
    }
