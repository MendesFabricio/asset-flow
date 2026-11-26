from datetime import date, datetime, timedelta
from decimal import Decimal

import pandas as pd
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import scoped_session, sessionmaker
from werkzeug.security import generate_password_hash

from db.models import (
    Asset,
    AssetTransaction,
    Base,
    Category,
    Debtor,
    Dividend,
    LoanInstallment,
    MarketData,
    Position,
    ReceivableLoan,
    User,
)
from db.models.signals import (
    FundamentalSnapshot,
    MarketRegimeDaily,
    PriceHistoryDaily,
    SignalLedger,
    SignalOutcome,
    SignalSetupStat,
)
from domain.quant import rebalance as rebal_mod
from domain.signals.ledger import audit_matured_signal_outcomes, capture_daily_signals_to_ledger
from domain.signals.walk_forward import run_purged_walk_forward_backtest
from domain.signals.wilson import (
    calibrated_probability,
    classify_confidence_tier,
    compute_brier_and_curve,
    wilson_lower_bound,
)
from routes.signals_v2 import compute_free_cash_bridge


@pytest.fixture
def signals_db(tmp_path):
    db_file = tmp_path / "signals_v2.db"
    engine = create_engine(f"sqlite:///{db_file}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    TestSession = scoped_session(sessionmaker(bind=engine))

    with TestSession() as session:
        session.add_all([
            User(id=1, username="quant_u", password_hash=generate_password_hash("QuantPass!")),
            Category(id=1, name="Ação", target_percent=Decimal("60")),
            Category(id=2, name="FII", target_percent=Decimal("20")),
            Category(id=3, name="Reserva", target_percent=Decimal("20")),
        ])
        session.commit()

    yield TestSession
    TestSession.remove()
    engine.dispose()


def test_wilson_and_sample_size_guard_blocks_strong_badge():
    # Even 19 wins / 19 trades (100% raw win rate) must be blocked below N=20 or OOS<8
    assert wilson_lower_bound(19, 19) > 0.80
    tier_small = classify_confidence_tier(
        sample_size_n=19, oos_sample_n=10,
        wilson_lb_90=0.85, wilson_lb_95=0.82,
        expectancy_net=0.05, profit_factor=2.5, oos_consistency_score=0.90,
    )
    assert tier_small == "INSUFFICIENT_SAMPLE"

    tier_small_oos = classify_confidence_tier(
        sample_size_n=35, oos_sample_n=7,
        wilson_lb_90=0.75, wilson_lb_95=0.70,
        expectancy_net=0.04, profit_factor=2.1, oos_consistency_score=0.85,
    )
    assert tier_small_oos == "INSUFFICIENT_SAMPLE"

    tier_strong = classify_confidence_tier(
        sample_size_n=35, oos_sample_n=14,
        wilson_lb_90=0.68, wilson_lb_95=0.62,
        expectancy_net=0.03, profit_factor=1.6, oos_consistency_score=0.80,
    )
    assert tier_strong == "ALTA_CERTEZA"

    shrunk = calibrated_probability(wins=4, n=4, prior_prob=0.50, prior_strength=10.0)
    assert 0.60 < shrunk < 0.70


def test_purged_walk_forward_respects_pit_filing_and_cooldown():
    # Generate 280 business days so horizon 30d (21 trading days) has full OOS episodes
    dates = pd.bdate_range("2024-01-02", periods=280).date
    prices = [20.0 * (1.001 ** i) for i in range(len(dates))]
    # Inject a steep pullback around index 120..128 to keep RSI < 38 while maintaining Value PIT snapshot
    for j in range(120, 128):
        prices[j] = prices[119] * (0.94 ** (j - 119))
    for j in range(128, len(dates)):
        prices[j] = prices[127] * (1.005 ** min(j - 127, 45))

    df = pd.DataFrame({"adj_close_tr": prices}, index=dates)
    bench = pd.Series([100.0 * (1.0002 ** i) for i in range(len(dates))], index=dates)

    # Filing date AFTER the index 120 window vs BEFORE it: PIT rule must ignore future filing!
    future_only_snap = FundamentalSnapshot(
        ticker="VALE3", asset_type="Ação",
        ref_date=dates[200], filing_date=dates[200], source="TEST",
        pl=5.0, pvp=0.8, roe=18.0, net_debt_ebitda=1.0,
    )
    res_no_pit = run_purged_walk_forward_backtest(
        {"VALE3": df}, bench, asset_class="ACAO_BR",
        setup_code="VALUE_GRAHAM_BAZIN", horizon_days=30,
        fundamentals_by_ticker={"VALE3": [future_only_snap]},
    )

    early_snap = FundamentalSnapshot(
        ticker="VALE3", asset_type="Ação",
        ref_date=dates[10], filing_date=dates[10], source="TEST",
        pl=5.0, pvp=0.8, roe=18.0, net_debt_ebitda=1.0,
    )
    res_with_pit = run_purged_walk_forward_backtest(
        {"VALE3": df}, bench, asset_class="ACAO_BR",
        setup_code="VALUE_GRAHAM_BAZIN", horizon_days=30,
        fundamentals_by_ticker={"VALE3": [early_snap]},
    )
    assert res_with_pit["sample_size_n"] >= res_no_pit["sample_size_n"]
    assert res_no_pit["sample_size_n"] <= res_with_pit["sample_size_n"]


def test_signal_ledger_capture_audit_and_brier_score(signals_db):
    today = date.today()
    d_emit = today - timedelta(days=40)
    d_exit = d_emit + timedelta(days=30)

    with signals_db() as session:
        asset = Asset(id=1, ticker="BBAS3", category_id=1)
        session.add(asset)
        session.flush()
        session.add(Position(id=1, user_id=1, asset_id=1, quantity=Decimal("100"), average_price=Decimal("25")))
        session.flush()

        session.add_all([
            PriceHistoryDaily(ticker="BBAS3", date=d_emit, close_raw=Decimal("25"), adj_close_tr=Decimal("25"), rsi_14=32.0, sma_20=Decimal("26"), sma_50=Decimal("27"), sma_200=Decimal("28")),
            PriceHistoryDaily(ticker="BBAS3", date=d_exit, close_raw=Decimal("28"), adj_close_tr=Decimal("28"), rsi_14=55.0, sma_20=Decimal("27"), sma_50=Decimal("27"), sma_200=Decimal("28")),
            PriceHistoryDaily(ticker="BBAS3", date=today, close_raw=Decimal("27"), adj_close_tr=Decimal("27"), rsi_14=34.0, sma_20=Decimal("28"), sma_50=Decimal("28"), sma_200=Decimal("28")),
            PriceHistoryDaily(ticker="^BVSP", date=d_emit, close_raw=Decimal("120000"), adj_close_tr=Decimal("120000")),
            PriceHistoryDaily(ticker="^BVSP", date=d_exit, close_raw=Decimal("121000"), adj_close_tr=Decimal("121000")),
            PriceHistoryDaily(ticker="^BVSP", date=today, close_raw=Decimal("121500"), adj_close_tr=Decimal("121500")),
            FundamentalSnapshot(
                ticker="BBAS3", asset_type="Ação", ref_date=d_emit - timedelta(days=5),
                filing_date=d_emit - timedelta(days=5), source="TEST",
                pl=4.8, pvp=0.75, roe=20.0, net_debt_ebitda=0.8,
            ),
            MarketRegimeDaily(
                date=today, ibov_trend="BULL", ifix_trend="SIDE", sp500_trend="BULL",
                selic_annual=11.0, selic_delta_90d="FLAT", ibov_vol_21d=15.0, vol_regime="NORMAL",
                composite_regime="BULL_FLAT_NORMAL",
            ),
            SignalSetupStat(
                setup_code="VALUE_GRAHAM_BAZIN", asset_class="ACAO_BR", regime_bucket="GLOBAL",
                horizon_days=90, sample_size_n=35, oos_sample_n=12, wins=26,
                win_rate=0.7429, wilson_lb_90=0.61, wilson_lb_95=0.58, calibrated_prob=0.68,
                expectancy_net=0.04, excess_return_vs_bench=0.02, profit_factor=1.7, avg_return=0.04, median_return=0.035,
                max_drawdown_mae=-0.08, oos_consistency_score=0.80,
                updated_at=datetime.now(),
            ),
            SignalLedger(
                user_id=1, asset_id=1, ticker="BBAS3", asset_class="ACAO_BR",
                setup_code="VALUE_GRAHAM_BAZIN", setup_version="v2.0", emitted_date=d_emit,
                status="ALTA_CERTEZA", score=74.3, calibrated_prob=0.68, wilson_lb_95=0.58,
                sample_size_n=35, regime_code="BULL_FLAT_NORMAL",
                entry_price_raw=Decimal("25"), entry_adj_tr=Decimal("25"),
                benchmark_ticker="^BVSP", benchmark_entry=Decimal("120000"),
                triggers_json=[{"metric": "P/L", "actual": "4.8x", "rule": "<= 12x"}],
            ),
        ])
        session.commit()

        # Run twice -> second run should be idempotent for today's signals
        c1 = capture_daily_signals_to_ledger(session)
        c2 = capture_daily_signals_to_ledger(session)
        assert len(c1) >= 1
        assert len(c2) == 0

        audited = audit_matured_signal_outcomes(session, horizons=(30,))
        assert audited == 1

        joined = session.query(SignalLedger, SignalOutcome).join(SignalOutcome, SignalOutcome.ledger_id == SignalLedger.id).all()
        assert len(joined) == 1
        ledger_row, out_row = joined[0]
        assert out_row.hit_excess_bench is True
        assert out_row.net_return_pct > 10.0

        brier = compute_brier_and_curve(joined)
        assert brier["total_audited"] == 1
        assert brier["brier_score"] is not None and brier["brier_score"] < 0.15


def test_free_cash_bridge_and_smart_rebalance_wilson(signals_db):
    today = date.today()
    with signals_db() as session:
        a1 = Asset(id=1, ticker="PETR4", category_id=1)
        a_res = Asset(id=2, ticker="CAIXA", category_id=3)
        session.add_all([a1, a_res])
        session.flush()

        p1 = Position(id=1, user_id=1, asset_id=1, quantity=Decimal("100"), average_price=Decimal("30"), target_percent=Decimal("100"))
        p_res = Position(id=2, user_id=1, asset_id=2, quantity=Decimal("1"), average_price=Decimal("1000"), target_percent=Decimal("20"))
        session.add_all([p1, p_res])
        session.add_all([
            MarketData(asset_id=1, date=today, price=Decimal("30")),
            MarketData(asset_id=2, date=today, price=Decimal("1000")),
            Dividend(
                user_id=1, asset_id=1, date_com=today - timedelta(days=5),
                date_payment=today + timedelta(days=10), type="Dividendo",
                value_per_share=Decimal("1.50"), quantity_at_date=Decimal("100"),
                total_value=Decimal("150.00"), status="A RECEBER",
            ),
        ])

        d = Debtor(id=1, user_id=1, nome="Lucas")
        session.add(d)
        session.flush()
        loan = ReceivableLoan(
            id=1, user_id=1, debtor_id=1, descricao="Emprestimo", categoria="Geral",
            data_emprestimo=datetime.now() - timedelta(days=30), valor_total=Decimal("500"),
            is_parcelado=True, total_parcelas=2, fatura_mes="2026-04", status="PENDENTE",
        )
        session.add(loan)
        session.flush()
        session.add_all([
            # Open within 30d
            LoanInstallment(
                id=1, user_id=1, loan_id=1, numero_parcela=1,
                valor_parcela=Decimal("200.00"), data_vencimento=datetime.combine(today + timedelta(days=7), datetime.min.time()),
                fatura_mes="2026-05", status="ABERTA",
            ),
            # Overdue must be isolated into receivables_overdue_excluded, NOT summed in receivables_30d!
            LoanInstallment(
                id=2, user_id=1, loan_id=1, numero_parcela=2,
                valor_parcela=Decimal("300.00"), data_vencimento=datetime.combine(today - timedelta(days=10), datetime.min.time()),
                fatura_mes="2026-04", status="ATRASADA",
            ),
            SignalSetupStat(
                setup_code="VALUE_GRAHAM_BAZIN", asset_class="ACAO_BR", regime_bucket="GLOBAL",
                horizon_days=90, sample_size_n=30, oos_sample_n=10, wins=22,
                win_rate=0.7333, wilson_lb_90=0.60, wilson_lb_95=0.56, calibrated_prob=0.65,
                expectancy_net=0.03, excess_return_vs_bench=0.02, profit_factor=1.5, avg_return=0.03, median_return=0.025,
                max_drawdown_mae=-0.09, oos_consistency_score=0.78,
                updated_at=datetime.now(),
            ),
        ])
        session.commit()

        bridge = compute_free_cash_bridge(session, 1, window_days=30)
        assert bridge["components"]["dividends_30d"] == 150.0
        assert bridge["components"]["receivables_30d"] == 200.0
        assert bridge["components"]["receivables_overdue_excluded"] == 300.0
        assert bridge["net_free_cash_30d"] == 350.0

        reb = rebal_mod.calculate_smart_rebalance(
            session,
            lambda tickers: {"PETR4": 30.0, "CAIXA": 1000.0},
            monthly_contribution=2000.0,
            dolar_rate=5.0,
            max_asset_pct=100.0,
        )
        assert reb["status"] == "Sucesso"
        assert len(reb["sugestoes"]) >= 1
        assert any("wilson_lb_95" in s for s in reb["sugestoes"])
