"""
domain/quant_engine.py
Motor quantitativo isolado: Monte Carlo GBM, Risk Metrics,
Correlação, Smart Rebalance, Projeção de IF.
Exposto de forma modularizada no subpacote quant/
"""

# Re-exposição direta para compatibilidade de API de importações
from domain.quant.helpers import _align_prices_to_b3, _to_yf_ticker, get_risk_free_rate
from domain.quant.monte_carlo import run_monte_carlo
from domain.quant.risk import calculate_risk_metrics
from domain.quant.correlation import get_correlation_matrix, calculate_sector_correlation
from domain.quant.rebalance import calculate_smart_rebalance
from domain.quant.projection import calculate_income_projection, calculate_dividend_forecast
from domain.quant.optimization import calculate_markowitz_optimization, calculate_risk_parity, calculate_efficient_frontier_points
from domain.quant.analysis import calculate_kelly_criterion, calculate_alpha_attribution, calculate_rolling_sharpe, calculate_momentum_ranking
