"""
domain/valuation/calculator.py
Funções puras e determinísticas de Valuation (Bazin, Graham, Gordon, DCF),
Checklist de Saúde Financeira, Fórmula Mágica (Greenblatt) e Médias Setoriais.
"""
import math
from statistics import median
from typing import Optional


def _to_pos_float(val) -> Optional[float]:
    if val is None:
        return None
    try:
        f = float(val)
        return f if math.isfinite(f) and f > 0 else None
    except (TypeError, ValueError):
        return None


def _to_finite_float(val) -> Optional[float]:
    if val is None:
        return None
    try:
        f = float(val)
        return f if math.isfinite(f) else None
    except (TypeError, ValueError):
        return None


def calculate_bazin_price(
    dividend_per_share: Optional[float],
    desired_dy_pct: float = 6.0,
) -> Optional[float]:
    """Calcula o Preço Teto de Décio Bazin: Dividendo Anual / DY mínimo."""
    div = _to_pos_float(dividend_per_share)
    dy = _to_pos_float(desired_dy_pct)
    if div is None or dy is None:
        return None
    return round(div / (dy / 100.0), 2)


def calculate_graham_price(
    lpa: Optional[float],
    vpa: Optional[float],
) -> Optional[float]:
    """Calcula o Valor Intrínseco clássico de Benjamin Graham: sqrt(22.5 * LPA * VPA)."""
    lpa_v = _to_pos_float(lpa)
    vpa_v = _to_pos_float(vpa)
    if lpa_v is None or vpa_v is None:
        return None
    return round(math.sqrt(22.5 * lpa_v * vpa_v), 2)


def calculate_gordon_price(
    dividend_per_share: Optional[float],
    required_return_pct: float = 12.0,
    growth_pct: float = 5.0,
) -> Optional[float]:
    """Calcula o preço justo pelo Modelo de Crescimento de Gordon: D1 / (k - g)."""
    div = _to_pos_float(dividend_per_share)
    k = _to_pos_float(required_return_pct)
    g = _to_finite_float(growth_pct)
    if div is None or k is None or g is None:
        return None
    k_dec = k / 100.0
    g_dec = max(-0.05, min(g / 100.0, k_dec - 0.005))
    if k_dec <= g_dec + 0.004:
        return None
    d1 = div * (1.0 + g_dec)
    return round(d1 / (k_dec - g_dec), 2)


def calculate_dcf_price(
    fcf_per_share: Optional[float],
    growth_pct: float = 7.0,
    terminal_growth_pct: float = 3.0,
    discount_rate_pct: float = 12.5,
    years: int = 5,
) -> Optional[float]:
    """Calcula o valor justo por Fluxo de Caixa Descontado (DCF) simplificado por ação."""
    fcf = _to_pos_float(fcf_per_share)
    w_pct = _to_pos_float(discount_rate_pct)
    g_pct = _to_finite_float(growth_pct)
    gt_pct = _to_finite_float(terminal_growth_pct)
    if fcf is None or w_pct is None or g_pct is None or gt_pct is None:
        return None

    w = w_pct / 100.0
    g = max(-0.10, min(g_pct / 100.0, 0.35))
    gt = max(0.0, min(gt_pct / 100.0, w - 0.01))
    if w <= gt + 0.005 or years < 1:
        return None

    pv_cashflows = 0.0
    cf = fcf
    for yr in range(1, years + 1):
        cf = cf * (1.0 + g)
        pv_cashflows += cf / ((1.0 + w) ** yr)

    terminal_val = (cf * (1.0 + gt)) / (w - gt)
    pv_terminal = terminal_val / ((1.0 + w) ** years)
    return round(pv_cashflows + pv_terminal, 2)


def _eval_criterion(
    key: str,
    label: str,
    value: Optional[float],
    fmt_value: str,
    rule_text: str,
    status: str,
) -> dict:
    return {
        "key": key,
        "label": label,
        "value": round(value, 2) if value is not None else None,
        "formatted": fmt_value,
        "rule": rule_text,
        "status": status,  # "pass" | "warn" | "fail" | "unknown"
    }


def evaluate_fundamental_checklist(asset_type: str, m: dict) -> tuple[list[dict], int]:
    """Avalia critérios objetivos de saúde financeira e retorna (itens, quality_score 0..100)."""
    t = (asset_type or "Ação").strip()
    price = _to_pos_float(m.get("price"))
    dy = _to_finite_float(m.get("dy_12m"))
    pl = _to_finite_float(m.get("pl"))
    pvp = _to_finite_float(m.get("pvp"))
    roe = _to_finite_float(m.get("roe"))
    net_margin = _to_finite_float(m.get("net_margin"))
    debt_ebitda = _to_finite_float(m.get("debt_to_ebitda"))
    bazin = _to_pos_float(m.get("bazin_price"))
    graham = _to_pos_float(m.get("graham_price"))

    items: list[dict] = []

    if t == "FII":
        # 1. P/VP
        if pvp is None or pvp <= 0:
            items.append(_eval_criterion("pvp", "Preço sobre VPA (P/VP)", None, "N/D", "Ideal entre 0,75x e 1,02x", "unknown"))
        elif 0.75 <= pvp <= 1.02:
            items.append(_eval_criterion("pvp", "Preço sobre VPA (P/VP)", pvp, f"{pvp:.2f}x", "Negociando com desconto ou justo", "pass"))
        elif pvp < 0.75 or pvp <= 1.10:
            items.append(_eval_criterion("pvp", "Preço sobre VPA (P/VP)", pvp, f"{pvp:.2f}x", "Desconto extremo ou ágio leve", "warn"))
        else:
            items.append(_eval_criterion("pvp", "Preço sobre VPA (P/VP)", pvp, f"{pvp:.2f}x", "Ágio elevado (> 1,10x)", "fail"))

        # 2. DY 12m
        if dy is None:
            items.append(_eval_criterion("dy", "Dividend Yield (12m)", None, "N/D", "Ideal ≥ 8,5% a.a.", "unknown"))
        elif dy >= 8.5:
            items.append(_eval_criterion("dy", "Dividend Yield (12m)", dy, f"{dy:.2f}%", "DY atrativo (≥ 8,5%)", "pass"))
        elif dy >= 6.5:
            items.append(_eval_criterion("dy", "Dividend Yield (12m)", dy, f"{dy:.2f}%", "DY moderado (6,5%–8,5%)", "warn"))
        else:
            items.append(_eval_criterion("dy", "Dividend Yield (12m)", dy, f"{dy:.2f}%", "DY abaixo de 6,5%", "fail"))

        # 3. Margem Preço Teto (8% FII)
        if bazin and price:
            diff = ((bazin - price) / price) * 100.0
            status = "pass" if diff >= 0 else ("warn" if diff >= -10 else "fail")
            items.append(_eval_criterion("teto", "Margem vs Preço Teto", diff, f"{diff:+.1f}%", "Ideal acima de 0% (abaixo do teto)", status))
        else:
            items.append(_eval_criterion("teto", "Margem vs Preço Teto", None, "N/D", "Provento insuficiente para calcular teto", "unknown"))

        # 4. Alavancagem (se disponível no raw_metrics)
        lev = _to_finite_float(m.get("leverage_pct"))
        if lev is None:
            items.append(_eval_criterion("leverage", "Alavancagem (Relatório)", None, "N/D", "Ideal ≤ 15% do PL", "unknown"))
        elif lev <= 15.0:
            items.append(_eval_criterion("leverage", "Alavancagem (Relatório)", lev, f"{lev:.1f}%", "Alavancagem conservadora", "pass"))
        elif lev <= 30.0:
            items.append(_eval_criterion("leverage", "Alavancagem (Relatório)", lev, f"{lev:.1f}%", "Alavancagem moderada (15%–30%)", "warn"))
        else:
            items.append(_eval_criterion("leverage", "Alavancagem (Relatório)", lev, f"{lev:.1f}%", "Alavancagem elevada (> 30%)", "fail"))
    else:
        # 1. Lucratividade & Preço/Lucro
        if pl is None:
            items.append(_eval_criterion("pl", "Preço / Lucro (P/L)", None, "N/D", "Ideal positivo até 15x", "unknown"))
        elif 0 < pl <= 15.0:
            items.append(_eval_criterion("pl", "Preço / Lucro (P/L)", pl, f"{pl:.1f}x", "Múltiplo atrativo (0 < P/L ≤ 15x)", "pass"))
        elif 15.0 < pl <= 25.0:
            items.append(_eval_criterion("pl", "Preço / Lucro (P/L)", pl, f"{pl:.1f}x", "Múltiplo intermediário (15x–25x)", "warn"))
        else:
            items.append(_eval_criterion("pl", "Preço / Lucro (P/L)", pl, f"{pl:.1f}x", "Prejuízo ou P/L esticado (> 25x)", "fail"))

        # 2. ROE
        if roe is None:
            items.append(_eval_criterion("roe", "Rentabilidade (ROE)", None, "N/D", "Ideal ≥ 15%", "unknown"))
        elif roe >= 15.0:
            items.append(_eval_criterion("roe", "Rentabilidade (ROE)", roe, f"{roe:.1f}%", "Alta rentabilidade (ROE ≥ 15%)", "pass"))
        elif roe >= 10.0:
            items.append(_eval_criterion("roe", "Rentabilidade (ROE)", roe, f"{roe:.1f}%", "Rentabilidade razoável (10%–15%)", "warn"))
        else:
            items.append(_eval_criterion("roe", "Rentabilidade (ROE)", roe, f"{roe:.1f}%", "Baixo retorno sobre patrimônio (< 10%)", "fail"))

        # 3. Margem Líquida
        if net_margin is None:
            items.append(_eval_criterion("margin", "Margem Líquida", None, "N/D", "Ideal ≥ 10%", "unknown"))
        elif net_margin >= 10.0:
            items.append(_eval_criterion("margin", "Margem Líquida", net_margin, f"{net_margin:.1f}%", "Margem saudável (≥ 10%)", "pass"))
        elif net_margin >= 4.0:
            items.append(_eval_criterion("margin", "Margem Líquida", net_margin, f"{net_margin:.1f}%", "Margem moderada (4%–10%)", "warn"))
        else:
            items.append(_eval_criterion("margin", "Margem Líquida", net_margin, f"{net_margin:.1f}%", "Margem pressionada ou negativa", "fail"))

        # 4. Endividamento
        if debt_ebitda is None:
            items.append(_eval_criterion("debt", "Dívida Líq. / EBITDA", None, "N/D", "Ideal ≤ 2,5x", "unknown"))
        elif debt_ebitda <= 2.5:
            items.append(_eval_criterion("debt", "Dívida Líq. / EBITDA", debt_ebitda, f"{debt_ebitda:.2f}x", "Endividamento sob controle", "pass"))
        elif debt_ebitda <= 3.5:
            items.append(_eval_criterion("debt", "Dívida Líq. / EBITDA", debt_ebitda, f"{debt_ebitda:.2f}x", "Alavancagem em atenção (2,5x–3,5x)", "warn"))
        else:
            items.append(_eval_criterion("debt", "Dívida Líq. / EBITDA", debt_ebitda, f"{debt_ebitda:.2f}x", "Alavancagem elevada (> 3,5x)", "fail"))

        # 5. Dividend Yield
        if dy is None:
            items.append(_eval_criterion("dy", "Dividend Yield (12m)", None, "N/D", "Ideal ≥ 6,0% a.a.", "unknown"))
        elif dy >= 6.0:
            items.append(_eval_criterion("dy", "Dividend Yield (12m)", dy, f"{dy:.2f}%", "Bom pagamento de proventos (≥ 6%)", "pass"))
        elif dy >= 3.0:
            items.append(_eval_criterion("dy", "Dividend Yield (12m)", dy, f"{dy:.2f}%", "Provento moderado (3%–6%)", "warn"))
        else:
            items.append(_eval_criterion("dy", "Dividend Yield (12m)", dy, f"{dy:.2f}%", "DY baixo (< 3%)", "fail"))

        # 6. Preço vs Valor Justo (Bazin / Graham)
        targets = [v for v in (bazin, graham) if v and v > 0]
        if targets and price:
            best_target = max(targets)
            margin_safety = ((best_target - price) / price) * 100.0
            status = "pass" if margin_safety >= 10.0 else ("warn" if margin_safety >= -10.0 else "fail")
            items.append(_eval_criterion("valuation", "Desconto (Bazin/Graham)", margin_safety, f"{margin_safety:+.1f}%", "Ideal ≥ +10% abaixo do teto/VI", status))
        else:
            items.append(_eval_criterion("valuation", "Desconto (Bazin/Graham)", None, "N/D", "Sem LPA/VPA/Dividendo suficiente", "unknown"))

    known = [i for i in items if i["status"] != "unknown"]
    if not known:
        return items, 0

    points_map = {"pass": 100.0, "warn": 55.0, "fail": 0.0}
    raw_score = sum(points_map[i["status"]] for i in known) / len(known)
    missing_penalty = (len(items) - len(known)) * 4.0
    score = round(raw_score - missing_penalty)
    return items, int(max(0, min(100, score)))


def compute_magic_formula_ranks(items: list[dict]) -> dict[str, float]:
    """Calcula score (0..100) baseado na Fórmula Mágica de Greenblatt (Earnings Yield + ROIC/ROE)."""
    eligible = []
    for it in items:
        if it.get("asset_type") != "Ação":
            continue
        ev_ebitda = _to_pos_float(it.get("ev_ebitda"))
        pl = _to_pos_float(it.get("pl"))
        ey = (1.0 / ev_ebitda) if ev_ebitda else ((1.0 / pl) if pl else None)
        eff = _to_finite_float(it.get("roic"))
        if eff is None:
            eff = _to_finite_float(it.get("roe"))
        if ey is not None and eff is not None and eff > 0:
            eligible.append((it["ticker"], ey, eff))

    n = len(eligible)
    if n == 0:
        return {}
    if n == 1:
        return {eligible[0][0]: 100.0}

    by_ey = sorted(eligible, key=lambda x: x[1], reverse=True)
    by_eff = sorted(eligible, key=lambda x: x[2], reverse=True)

    ey_rank = {row[0]: idx for idx, row in enumerate(by_ey)}
    eff_rank = {row[0]: idx for idx, row in enumerate(by_eff)}

    max_sum = 2.0 * (n - 1)
    scores = {}
    for ticker, _, _ in eligible:
        combined = ey_rank[ticker] + eff_rank[ticker]
        scores[ticker] = round((1.0 - (combined / max_sum)) * 100.0, 1)
    return scores


def compute_sector_averages(items: list[dict]) -> dict[str, dict]:
    """Calcula medianas setoriais para contextualizar cada ativo frente aos pares."""
    buckets: dict[tuple[str, str], list[dict]] = {}
    for it in items:
        key = (it.get("asset_type") or "Ação", it.get("sector") or "Outros")
        buckets.setdefault(key, []).append(it)

    metrics = ("dy_12m", "pl", "pvp", "roe", "net_margin", "ev_ebitda", "quality_score")
    averages: dict[str, dict] = {}
    for (atype, sector), group in buckets.items():
        stats = {"asset_type": atype, "sector": sector, "count": len(group)}
        for metric in metrics:
            vals = [_to_finite_float(g.get(metric)) for g in group]
            clean = [v for v in vals if v is not None]
            stats[metric] = round(median(clean), 2) if clean else None
        averages[f"{atype}::{sector}"] = stats
    return averages
