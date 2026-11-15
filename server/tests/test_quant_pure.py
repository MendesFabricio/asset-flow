import pytest
import numpy as np
import pandas as pd

class TestQuantMath:
    def test_kelly_criterion_math(self):
        wins = pd.Series([0.05, 0.03, 0.04])
        losses = pd.Series([-0.02, -0.01])
        total_days = len(wins) + len(losses)
        win_days = len(wins)
        if total_days == 0 or win_days == 0 or len(losses) == 0:
            return
        p = win_days / total_days
        avg_win = float(wins.mean())
        avg_loss = abs(float(losses.mean()))
        b = avg_win / avg_loss if avg_loss > 0 else 1.0
        f = p - (1 - p) / b
        assert f >= 0
        assert isinstance(f, float)

    def test_graham_formula_calculation(self):
        lpa = 2.5
        vpa = 10.0
        graham_value = (22.5 * lpa * vpa) ** 0.5
        assert graham_value > 0
        assert isinstance(graham_value, float)

    def test_rolling_sharpe_math(self):
        returns = pd.Series([0.01, -0.005, 0.02, -0.01, 0.015])
        window = 3
        rolling = returns.rolling(window).mean() / returns.rolling(window).std()
        assert not rolling.isnull().all()

    def test_sanitize_price_glitches_removes_temporary_100x_drop(self):
        from domain.quant.helpers import _sanitize_price_glitches

        dates = pd.date_range("2026-01-01", periods=20, freq="B")
        vals = [110.0] * 20
        vals[9] = 1.07
        vals[10] = 1.06
        vals[11] = 1.08
        df = pd.DataFrame({"XPML11.SA": vals}, index=dates)

        cleaned = _sanitize_price_glitches(df)
        assert pd.isna(cleaned.iloc[9]["XPML11.SA"])
        assert pd.isna(cleaned.iloc[10]["XPML11.SA"])
        assert pd.isna(cleaned.iloc[11]["XPML11.SA"])
        assert cleaned.iloc[8]["XPML11.SA"] == 110.0
        assert cleaned.iloc[12]["XPML11.SA"] == 110.0
