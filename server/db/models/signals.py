"""
server/db/models/signals.py
Modelos ORM para o Motor de Pontos de Compra e Sinais Estatísticos v2:
- PriceHistoryDaily: séries diárias nominais e Total Return (adj_close_tr) + RSI/SMAs/Vol
- FundamentalSnapshot: fundamentos point-in-time indexados por filing_date (zero look-ahead bias)
- MarketRegimeDaily: classificação diária de regime macro (tendência + juros + volatilidade)
- SignalSetupStat: estatísticas históricas Walk-Forward por classe, setup, regime e horizonte
- SignalLedger: registro imutável de todo sinal emitido em produção
- SignalOutcome: auditoria pós-horizonte (30/90/180/365d) com retorno líquido e Brier component
"""
from datetime import datetime
from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    Numeric,
    String,
    UniqueConstraint,
)
from db.models.base import Base


class PriceHistoryDaily(Base):
    __tablename__ = "price_history_daily"

    id = Column(Integer, primary_key=True)
    ticker = Column(String(24), nullable=False)
    date = Column(Date, nullable=False)
    open_raw = Column(Numeric(18, 4), nullable=True)
    high_raw = Column(Numeric(18, 4), nullable=True)
    low_raw = Column(Numeric(18, 4), nullable=True)
    close_raw = Column(Numeric(18, 4), nullable=False)
    adj_close_tr = Column(Numeric(18, 6), nullable=False)
    div_cash = Column(Numeric(18, 6), default=0.0)
    split_factor = Column(Numeric(18, 6), default=1.0)
    volume = Column(Numeric(20, 2), nullable=True)
    rsi_14 = Column(Float, nullable=True)
    sma_20 = Column(Numeric(18, 6), nullable=True)
    sma_50 = Column(Numeric(18, 6), nullable=True)
    sma_200 = Column(Numeric(18, 6), nullable=True)
    ewma_vol_21d = Column(Float, nullable=True)

    __table_args__ = (
        UniqueConstraint("ticker", "date", name="_phd_ticker_date_uc"),
        Index("ix_phd_ticker_date", "ticker", "date"),
    )


class FundamentalSnapshot(Base):
    __tablename__ = "fundamental_snapshots"

    id = Column(Integer, primary_key=True)
    ticker = Column(String(24), nullable=False)
    asset_type = Column(String(24), nullable=False)  # ACAO_BR | FII | ETF_EXT
    ref_date = Column(Date, nullable=False)
    filing_date = Column(Date, nullable=False)
    source = Column(String(24), nullable=False)  # CVM_ITR | CVM_DFP | B3_FNET | YAHOO_PIT
    lpa = Column(Numeric(18, 4), nullable=True)
    vpa = Column(Numeric(18, 4), nullable=True)
    div_12m_adj = Column(Numeric(18, 4), nullable=True)
    pl = Column(Float, nullable=True)
    pvp = Column(Float, nullable=True)
    roe = Column(Float, nullable=True)
    roic_real = Column(Float, nullable=True)
    net_margin = Column(Float, nullable=True)
    net_debt_ebitda = Column(Float, nullable=True)
    vacancy_pct = Column(Float, nullable=True)
    leverage_pct = Column(Float, nullable=True)
    quality_score = Column(Integer, nullable=True)

    __table_args__ = (
        UniqueConstraint("ticker", "filing_date", "source", name="_fsnap_ticker_filing_src_uc"),
        Index("ix_fsnap_lookup", "ticker", "filing_date"),
    )


class MarketRegimeDaily(Base):
    __tablename__ = "market_regime_daily"

    date = Column(Date, primary_key=True)
    ibov_trend = Column(String(16), nullable=False)
    ifix_trend = Column(String(16), nullable=False)
    sp500_trend = Column(String(16), nullable=False)
    selic_annual = Column(Float, nullable=False)
    selic_delta_90d = Column(String(16), nullable=False)
    ibov_vol_21d = Column(Float, nullable=False)
    vol_regime = Column(String(16), nullable=False)
    composite_regime = Column(String(64), nullable=False)


class SignalSetupStat(Base):
    __tablename__ = "signal_setup_stats"

    id = Column(Integer, primary_key=True)
    setup_code = Column(String(48), nullable=False)
    asset_class = Column(String(24), nullable=False)
    regime_bucket = Column(String(64), nullable=False)
    horizon_days = Column(Integer, nullable=False)
    sample_size_n = Column(Integer, nullable=False)
    oos_sample_n = Column(Integer, nullable=False)
    wins = Column(Integer, nullable=False)
    win_rate = Column(Float, nullable=False)
    wilson_lb_90 = Column(Float, nullable=False)
    wilson_lb_95 = Column(Float, nullable=False)
    calibrated_prob = Column(Float, nullable=False)
    expectancy_net = Column(Float, nullable=False)
    excess_return_vs_bench = Column(Float, nullable=False)
    profit_factor = Column(Float, nullable=True)
    avg_return = Column(Float, nullable=False)
    median_return = Column(Float, nullable=False)
    max_drawdown_mae = Column(Float, nullable=False)
    oos_consistency_score = Column(Float, nullable=False)
    updated_at = Column(DateTime, nullable=False, default=datetime.now)

    __table_args__ = (
        UniqueConstraint(
            "setup_code", "asset_class", "regime_bucket", "horizon_days",
            name="_sstats_setup_class_regime_h_uc",
        ),
    )


class SignalLedger(Base):
    __tablename__ = "signal_ledger"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    asset_id = Column(Integer, ForeignKey("assets.id", ondelete="SET NULL"), nullable=True)
    ticker = Column(String(24), nullable=False)
    asset_class = Column(String(24), nullable=False)
    setup_code = Column(String(48), nullable=False)
    setup_version = Column(String(16), nullable=False, default="v2.0")
    emitted_date = Column(Date, nullable=False)
    status = Column(String(24), nullable=False)
    score = Column(Float, nullable=False)
    calibrated_prob = Column(Float, nullable=False)
    wilson_lb_95 = Column(Float, nullable=False)
    sample_size_n = Column(Integer, nullable=False)
    regime_code = Column(String(64), nullable=False)
    entry_price_raw = Column(Numeric(18, 4), nullable=False)
    entry_adj_tr = Column(Numeric(18, 6), nullable=False)
    benchmark_ticker = Column(String(24), nullable=False)
    benchmark_entry = Column(Numeric(18, 6), nullable=False)
    triggers_json = Column(JSON, nullable=False, default=list)

    __table_args__ = (
        UniqueConstraint("user_id", "ticker", "setup_code", "emitted_date", name="_sledger_user_tkr_setup_date_uc"),
        Index("ix_sledger_date", "emitted_date", "ticker"),
    )


class SignalOutcome(Base):
    __tablename__ = "signal_outcomes"

    id = Column(Integer, primary_key=True)
    ledger_id = Column(Integer, ForeignKey("signal_ledger.id", ondelete="CASCADE"), nullable=False, index=True)
    horizon_days = Column(Integer, nullable=False)
    eval_date = Column(Date, nullable=False)
    exit_price_raw = Column(Numeric(18, 4), nullable=False)
    exit_adj_tr = Column(Numeric(18, 6), nullable=False)
    dividends_net_period = Column(Numeric(18, 4), default=0.0)
    gross_return_pct = Column(Float, nullable=False)
    cost_slippage_pct = Column(Float, nullable=False)
    net_return_pct = Column(Float, nullable=False)
    benchmark_return_pct = Column(Float, nullable=False)
    cdi_return_pct = Column(Float, nullable=False)
    hit_absolute = Column(Boolean, nullable=False)
    hit_excess_bench = Column(Boolean, nullable=False)
    max_adverse_excursion_pct = Column(Float, nullable=False)
    brier_component = Column(Float, nullable=False)
    audited_at = Column(DateTime, nullable=False, default=datetime.now)

    __table_args__ = (
        UniqueConstraint("ledger_id", "horizon_days", name="_soutcome_ledger_h_uc"),
    )
