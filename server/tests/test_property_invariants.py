"""Testes baseados em propriedades (Hypothesis) para invariantes financeiras e quantitativas."""
from decimal import Decimal
from hypothesis import given, settings, strategies as st

from domain.signals.wilson import classify_confidence_tier, wilson_lower_bound
from domain.valuation.calculator import (
    calculate_bazin_price,
    calculate_dcf_price,
    calculate_graham_price,
)
from services_modules.report_data import normalize_action_badge, sanitize_pdf_text


@given(
    n=st.integers(min_value=1, max_value=5000),
    wins_ratio=st.floats(min_value=0.0, max_value=1.0, allow_nan=False, allow_infinity=False),
    z=st.floats(min_value=0.5, max_value=3.5, allow_nan=False, allow_infinity=False),
)
@settings(max_examples=100)
def test_wilson_lower_bound_invariants(n, wins_ratio, z):
    wins = int(n * wins_ratio)
    lb = wilson_lower_bound(wins, n, z=z)
    assert 0.0 <= lb <= 1.0
    if wins < n:
        lb_higher = wilson_lower_bound(wins + 1, n, z=z)
        assert lb_higher >= lb - 1e-12


@given(n=st.integers(min_value=0, max_value=19), oos_n=st.integers(min_value=0, max_value=50))
def test_confidence_tier_insufficient_sample(n, oos_n):
    assert classify_confidence_tier(n, oos_n, 0.9, 0.9, 0.2, 2.0, 1.0) == "INSUFFICIENT_SAMPLE"


@given(
    div=st.floats(min_value=0.01, max_value=100.0, allow_nan=False, allow_infinity=False),
    dy=st.floats(min_value=1.0, max_value=30.0, allow_nan=False, allow_infinity=False),
)
def test_bazin_monotonicity(div, dy):
    p1 = calculate_bazin_price(div, desired_dy_pct=dy)
    p2 = calculate_bazin_price(div * 2.0, desired_dy_pct=dy)
    p3 = calculate_bazin_price(div, desired_dy_pct=dy + 2.0)
    assert p1 is not None and p2 is not None and p3 is not None
    assert p2 >= p1
    assert p3 <= p1


@given(
    lpa=st.floats(min_value=0.01, max_value=200.0, allow_nan=False, allow_infinity=False),
    vpa=st.floats(min_value=0.01, max_value=500.0, allow_nan=False, allow_infinity=False),
)
def test_graham_positive_and_monotone(lpa, vpa):
    g1 = calculate_graham_price(lpa, vpa)
    g2 = calculate_graham_price(lpa * 1.5, vpa)
    assert g1 is not None and g1 > 0
    assert g2 is not None and g2 >= g1


@given(fcf=st.floats(min_value=-1000.0, max_value=0.0, allow_nan=False, allow_infinity=False))
def test_dcf_non_positive_fcf_returns_none(fcf):
    assert calculate_dcf_price(fcf) is None


@given(text=st.text(max_size=200))
@settings(max_examples=100)
def test_sanitize_pdf_text_idempotent_and_safe(text):
    once = sanitize_pdf_text(text)
    twice = sanitize_pdf_text(once)
    assert once == twice
    assert all(ord(c) <= 255 or c in ("•", "—", "–") for c in once)


def test_sanitize_preserves_version_strings():
    assert "v2.0" in sanitize_pdf_text("Motor v2.0 com alta de 9.4%")
    assert "9,4%" in sanitize_pdf_text("Motor v2.0 com alta de 9.4%")


def test_normalize_action_badge_exhaustive():
    assert normalize_action_badge("COMPRA_FORTE") == "COMPRAR"
    assert normalize_action_badge("APORTAR") == "COMPRAR"
    assert normalize_action_badge("REDUZIR") == "REALIZAR"
    assert normalize_action_badge("NEUTRO") == "NEUTRO"
    # Conservação Decimal simples
    assert Decimal("0.1") + Decimal("0.2") == Decimal("0.3")


def test_extract_close_prices_falls_back_when_adj_close_corrupted():
    import pandas as pd
    from domain.quant.helpers import _extract_close_prices

    idx = pd.date_range("2026-01-01", periods=6, freq="B")
    df = pd.DataFrame(
        {
            ("XPML11.SA", "Close"): [100.0, 101.0, 102.0, 101.0, 100.0, 99.0],
            ("XPML11.SA", "Adj Close"): [13.0, 13.1, 13.2, 101.0, 100.0, 99.0],
        },
        index=idx,
    )
    df.columns = pd.MultiIndex.from_tuples(df.columns)
    res = _extract_close_prices(df)
    assert float(res["XPML11.SA"].iloc[0]) == 100.0
