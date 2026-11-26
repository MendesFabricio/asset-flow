"""
server/domain/signals/__init__.py
Motor de Pontos de Compra e Sinais Estatísticos v2 (Purged Walk-Forward, Wilson & Brier Calibration).
"""
from domain.signals.wilson import (
    wilson_lower_bound,
    calibrated_probability,
    classify_confidence_tier,
    compute_brier_and_curve,
)
from domain.signals.regime import (
    detect_and_persist_market_regime,
    get_latest_market_regime,
)
from domain.signals.walk_forward import (
    ASSET_CLASS_BENCHMARK,
    ASSET_CLASS_COST_BPS,
    HORIZONS_TRADING_DAYS,
    infer_signal_asset_class,
    run_purged_walk_forward_backtest,
    recalibrate_all_setups,
)
from domain.signals.ledger import (
    sync_price_history_from_yf,
    capture_daily_signals_to_ledger,
    audit_matured_signal_outcomes,
    compute_signal_history_returns,
)

__all__ = [
    "wilson_lower_bound",
    "calibrated_probability",
    "classify_confidence_tier",
    "compute_brier_and_curve",
    "detect_and_persist_market_regime",
    "get_latest_market_regime",
    "ASSET_CLASS_BENCHMARK",
    "ASSET_CLASS_COST_BPS",
    "HORIZONS_TRADING_DAYS",
    "infer_signal_asset_class",
    "run_purged_walk_forward_backtest",
    "recalibrate_all_setups",
    "sync_price_history_from_yf",
    "capture_daily_signals_to_ledger",
    "audit_matured_signal_outcomes",
    "compute_signal_history_returns",
]
