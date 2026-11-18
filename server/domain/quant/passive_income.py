"""
domain/quant/passive_income.py
Simulador de Renda Passiva (Efeito Bola de Neve) para planejamento previdenciário.
"""
from typing import Optional


def simulate_passive_income(
    initial_portfolio: float,
    monthly_contribution: float,
    target_monthly_income: float,
    annual_dy_pct: float = 8.0,
    annual_growth_pct: float = 4.0,
    reinvest_dividends: bool = True,
    max_years: int = 35,
) -> dict:
    """Projeta a evolução mensal/anual do patrimônio e renda passiva até atingir a meta."""
    patrimony = max(0.0, float(initial_portfolio or 0.0))
    contribution = max(0.0, float(monthly_contribution or 0.0))
    target = max(1.0, float(target_monthly_income or 1.0))

    dy_annual = max(0.1, min(float(annual_dy_pct or 8.0), 40.0)) / 100.0
    growth_annual = max(0.0, min(float(annual_growth_pct or 0.0), 30.0)) / 100.0
    years_limit = max(1, min(int(max_years or 35), 50))

    monthly_dy = (1.0 + dy_annual) ** (1.0 / 12.0) - 1.0
    monthly_growth = (1.0 + growth_annual) ** (1.0 / 12.0) - 1.0

    contributed = patrimony
    total_dividends = 0.0
    months_to_goal: Optional[int] = 0 if (patrimony * monthly_dy) >= target else None

    annual_series = [{
        "year": 0,
        "patrimony": round(patrimony, 2),
        "total_contributed": round(contributed, 2),
        "monthly_income": round(patrimony * monthly_dy, 2),
        "annual_dividends": 0.0,
        "progress_pct": round(min(100.0, ((patrimony * monthly_dy) / target) * 100.0), 1),
    }]

    yearly_div_acc = 0.0
    for month in range(1, years_limit * 12 + 1):
        div_month = patrimony * monthly_dy
        yearly_div_acc += div_month
        total_dividends += div_month

        patrimony = patrimony * (1.0 + monthly_growth) + contribution
        if reinvest_dividends:
            patrimony += div_month
        contributed += contribution

        curr_monthly_income = patrimony * monthly_dy
        if months_to_goal is None and curr_monthly_income >= target:
            months_to_goal = month

        if month % 12 == 0:
            yr = month // 12
            annual_series.append({
                "year": yr,
                "patrimony": round(patrimony, 2),
                "total_contributed": round(contributed, 2),
                "monthly_income": round(curr_monthly_income, 2),
                "annual_dividends": round(yearly_div_acc, 2),
                "progress_pct": round(min(100.0, (curr_monthly_income / target) * 100.0), 1),
            })
            yearly_div_acc = 0.0

    final_income = patrimony * monthly_dy
    yoc = ((final_income * 12.0) / contributed * 100.0) if contributed > 0 else 0.0
    required_patrimony = target / monthly_dy if monthly_dy > 0 else 0.0

    return {
        "months_to_goal": months_to_goal,
        "years_to_goal": round(months_to_goal / 12.0, 1) if months_to_goal is not None else None,
        "required_patrimony": round(required_patrimony, 2),
        "initial_monthly_income": round(annual_series[0]["monthly_income"], 2),
        "final_patrimony": round(patrimony, 2),
        "final_monthly_income": round(final_income, 2),
        "total_contributed": round(contributed, 2),
        "total_dividends_generated": round(total_dividends, 2),
        "yield_on_cost_pct": round(yoc, 2),
        "annual_series": annual_series,
    }
