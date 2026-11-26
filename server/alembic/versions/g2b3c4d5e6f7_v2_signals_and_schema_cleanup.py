"""v2_signals_and_schema_cleanup

Revision ID: g2b3c4d5e6f7
Revises: d4e5f6a7b8c9
Create Date: 2026-11-24 23:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "g2b3c4d5e6f7"
down_revision: Union[str, Sequence[str], None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(insp, name: str) -> bool:
    return name in insp.get_table_names()


def _column_names(insp, table: str) -> set[str]:
    if not _table_exists(insp, table):
        return set()
    return {c["name"] for c in insp.get_columns(table)}


def _index_names(insp, table: str) -> set[str]:
    if not _table_exists(insp, table):
        return set()
    return {i["name"] for i in insp.get_indexes(table)}


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    # 1. Remove tabelas de Cartões de Crédito (removido do escopo) e AuditLog write-only
    for tbl in ("card_installments", "card_expenses", "credit_cards", "audit_logs"):
        if _table_exists(insp, tbl):
            op.drop_table(tbl)

    # 2. Remove colunas mortas / corrompidas por LLM em asset_transactions e assets sem recriar tabelas (evita ON DELETE CASCADE no SQLite)
    is_sqlite = bind.dialect.name == "sqlite"
    if "option_meta" in _column_names(insp, "asset_transactions"):
        if is_sqlite:
            op.execute("ALTER TABLE asset_transactions DROP COLUMN option_meta")
        else:
            with op.batch_alter_table("asset_transactions") as batch_op:
                batch_op.drop_column("option_meta")

    asset_cols = _column_names(insp, "assets")
    dead_asset_cols = [
        c for c in ("credit_rating", "duration_years", "indexer_cdi_pct", "indexer_ipca_pct")
        if c in asset_cols
    ]
    if dead_asset_cols:
        if is_sqlite:
            for col in dead_asset_cols:
                op.execute(f"ALTER TABLE assets DROP COLUMN {col}")
        else:
            with op.batch_alter_table("assets") as batch_op:
                for col in dead_asset_cols:
                    batch_op.drop_column(col)

    # 3. Formaliza monthly_portfolio_snapshot se ainda não existir em DB limpo
    if not _table_exists(insp, "monthly_portfolio_snapshot"):
        op.create_table(
            "monthly_portfolio_snapshot",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("year", sa.Integer(), nullable=False),
            sa.Column("month", sa.Integer(), nullable=False),
            sa.Column("total_invested_cost", sa.Numeric(18, 4), nullable=False),
            sa.Column("total_market_value", sa.Numeric(18, 4), nullable=False),
            sa.Column("realized_pnl", sa.Numeric(18, 4), default=0.00),
            sa.Column("unrealized_pnl", sa.Numeric(18, 4), default=0.00),
            sa.Column("asset_performance", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime()),
            sa.Column("updated_at", sa.DateTime()),
            sa.UniqueConstraint("user_id", "year", "month", name="_user_year_month_uc"),
        )

    # 4. Índices de Foreign Keys faltantes no domínio de Reembolsos
    if _table_exists(insp, "payment_transactions") and "ix_payment_tx_inst_id" not in _index_names(insp, "payment_transactions"):
        op.create_index("ix_payment_tx_inst_id", "payment_transactions", ["installment_id"], if_not_exists=True)
    if _table_exists(insp, "loan_installments") and "ix_loan_inst_loan_id" not in _index_names(insp, "loan_installments"):
        op.create_index("ix_loan_inst_loan_id", "loan_installments", ["loan_id"], if_not_exists=True)
    if _table_exists(insp, "receivable_loans") and "ix_rec_loans_debtor_id" not in _index_names(insp, "receivable_loans"):
        op.create_index("ix_rec_loans_debtor_id", "receivable_loans", ["debtor_id"], if_not_exists=True)

    # 4b. Alinha constraint única de dividends para incluir date_com (evita colisão quando pagamento coincide)
    if _table_exists(insp, "dividends"):
        ucs = {uc.get("name"): uc for uc in insp.get_unique_constraints("dividends") if uc.get("name")}
        div_uc = ucs.get("_dividend_unique_uc")
        target_cols = ["user_id", "asset_id", "date_com", "date_payment", "type", "total_value"]
        if div_uc is None or "date_com" not in (div_uc.get("column_names") or []):
            op.execute(
                "DELETE FROM dividends WHERE id NOT IN ("
                "SELECT MIN(id) FROM dividends "
                "GROUP BY user_id, asset_id, date_com, date_payment, type, total_value"
                ")"
            )
            with op.batch_alter_table("dividends") as batch_op:
                if div_uc is not None:
                    batch_op.drop_constraint("_dividend_unique_uc", type_="unique")
                batch_op.create_unique_constraint("_dividend_unique_uc", target_cols)

    # 5. Remove jobs LLM ociosos descontinuados
    if _table_exists(insp, "scheduled_jobs"):
        op.execute(
            "DELETE FROM scheduled_jobs WHERE name IN ("
            "'scheduled_morning_brief_generation', "
            "'scheduled_news_summary_warm', "
            "'scheduled_daily_sentiment_analysis'"
            ")"
        )

    # 6. Tabelas do Motor de Sinais Estatísticos v2
    if not _table_exists(insp, "price_history_daily"):
        op.create_table(
            "price_history_daily",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("ticker", sa.String(24), nullable=False),
            sa.Column("date", sa.Date(), nullable=False),
            sa.Column("open_raw", sa.Numeric(18, 4), nullable=True),
            sa.Column("high_raw", sa.Numeric(18, 4), nullable=True),
            sa.Column("low_raw", sa.Numeric(18, 4), nullable=True),
            sa.Column("close_raw", sa.Numeric(18, 4), nullable=False),
            sa.Column("adj_close_tr", sa.Numeric(18, 6), nullable=False),
            sa.Column("div_cash", sa.Numeric(18, 6), default=0.0),
            sa.Column("split_factor", sa.Numeric(18, 6), default=1.0),
            sa.Column("volume", sa.Numeric(20, 2), nullable=True),
            sa.Column("rsi_14", sa.Float(), nullable=True),
            sa.Column("sma_20", sa.Numeric(18, 6), nullable=True),
            sa.Column("sma_50", sa.Numeric(18, 6), nullable=True),
            sa.Column("sma_200", sa.Numeric(18, 6), nullable=True),
            sa.Column("ewma_vol_21d", sa.Float(), nullable=True),
            sa.UniqueConstraint("ticker", "date", name="_phd_ticker_date_uc"),
        )
        op.create_index("ix_phd_ticker_date", "price_history_daily", ["ticker", "date"], if_not_exists=True)

    if not _table_exists(insp, "fundamental_snapshots"):
        op.create_table(
            "fundamental_snapshots",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("ticker", sa.String(24), nullable=False),
            sa.Column("asset_type", sa.String(24), nullable=False),
            sa.Column("ref_date", sa.Date(), nullable=False),
            sa.Column("filing_date", sa.Date(), nullable=False),
            sa.Column("source", sa.String(24), nullable=False),
            sa.Column("lpa", sa.Numeric(18, 4), nullable=True),
            sa.Column("vpa", sa.Numeric(18, 4), nullable=True),
            sa.Column("div_12m_adj", sa.Numeric(18, 4), nullable=True),
            sa.Column("pl", sa.Float(), nullable=True),
            sa.Column("pvp", sa.Float(), nullable=True),
            sa.Column("roe", sa.Float(), nullable=True),
            sa.Column("roic_real", sa.Float(), nullable=True),
            sa.Column("net_margin", sa.Float(), nullable=True),
            sa.Column("net_debt_ebitda", sa.Float(), nullable=True),
            sa.Column("vacancy_pct", sa.Float(), nullable=True),
            sa.Column("leverage_pct", sa.Float(), nullable=True),
            sa.Column("quality_score", sa.Integer(), nullable=True),
            sa.UniqueConstraint("ticker", "filing_date", "source", name="_fsnap_ticker_filing_src_uc"),
        )
        op.create_index("ix_fsnap_lookup", "fundamental_snapshots", ["ticker", "filing_date"], if_not_exists=True)

    if not _table_exists(insp, "market_regime_daily"):
        op.create_table(
            "market_regime_daily",
            sa.Column("date", sa.Date(), primary_key=True),
            sa.Column("ibov_trend", sa.String(16), nullable=False),
            sa.Column("ifix_trend", sa.String(16), nullable=False),
            sa.Column("sp500_trend", sa.String(16), nullable=False),
            sa.Column("selic_annual", sa.Float(), nullable=False),
            sa.Column("selic_delta_90d", sa.String(16), nullable=False),
            sa.Column("ibov_vol_21d", sa.Float(), nullable=False),
            sa.Column("vol_regime", sa.String(16), nullable=False),
            sa.Column("composite_regime", sa.String(64), nullable=False),
        )

    if not _table_exists(insp, "signal_setup_stats"):
        op.create_table(
            "signal_setup_stats",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("setup_code", sa.String(48), nullable=False),
            sa.Column("asset_class", sa.String(24), nullable=False),
            sa.Column("regime_bucket", sa.String(64), nullable=False),
            sa.Column("horizon_days", sa.Integer(), nullable=False),
            sa.Column("sample_size_n", sa.Integer(), nullable=False),
            sa.Column("oos_sample_n", sa.Integer(), nullable=False),
            sa.Column("wins", sa.Integer(), nullable=False),
            sa.Column("win_rate", sa.Float(), nullable=False),
            sa.Column("wilson_lb_90", sa.Float(), nullable=False),
            sa.Column("wilson_lb_95", sa.Float(), nullable=False),
            sa.Column("calibrated_prob", sa.Float(), nullable=False),
            sa.Column("expectancy_net", sa.Float(), nullable=False),
            sa.Column("excess_return_vs_bench", sa.Float(), nullable=False),
            sa.Column("profit_factor", sa.Float(), nullable=True),
            sa.Column("avg_return", sa.Float(), nullable=False),
            sa.Column("median_return", sa.Float(), nullable=False),
            sa.Column("max_drawdown_mae", sa.Float(), nullable=False),
            sa.Column("oos_consistency_score", sa.Float(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.UniqueConstraint(
                "setup_code", "asset_class", "regime_bucket", "horizon_days",
                name="_sstats_setup_class_regime_h_uc",
            ),
        )

    if not _table_exists(insp, "signal_ledger"):
        op.create_table(
            "signal_ledger",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True),
            sa.Column("asset_id", sa.Integer(), sa.ForeignKey("assets.id", ondelete="SET NULL"), nullable=True),
            sa.Column("ticker", sa.String(24), nullable=False),
            sa.Column("asset_class", sa.String(24), nullable=False),
            sa.Column("setup_code", sa.String(48), nullable=False),
            sa.Column("setup_version", sa.String(16), nullable=False),
            sa.Column("emitted_date", sa.Date(), nullable=False),
            sa.Column("status", sa.String(24), nullable=False),
            sa.Column("score", sa.Float(), nullable=False),
            sa.Column("calibrated_prob", sa.Float(), nullable=False),
            sa.Column("wilson_lb_95", sa.Float(), nullable=False),
            sa.Column("sample_size_n", sa.Integer(), nullable=False),
            sa.Column("regime_code", sa.String(64), nullable=False),
            sa.Column("entry_price_raw", sa.Numeric(18, 4), nullable=False),
            sa.Column("entry_adj_tr", sa.Numeric(18, 6), nullable=False),
            sa.Column("benchmark_ticker", sa.String(24), nullable=False),
            sa.Column("benchmark_entry", sa.Numeric(18, 6), nullable=False),
            sa.Column("triggers_json", sa.JSON(), nullable=False),
            sa.UniqueConstraint("user_id", "ticker", "setup_code", "emitted_date", name="_sledger_user_tkr_setup_date_uc"),
        )
        op.create_index("ix_sledger_date", "signal_ledger", ["emitted_date", "ticker"], if_not_exists=True)

    if not _table_exists(insp, "signal_outcomes"):
        op.create_table(
            "signal_outcomes",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("ledger_id", sa.Integer(), sa.ForeignKey("signal_ledger.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("horizon_days", sa.Integer(), nullable=False),
            sa.Column("eval_date", sa.Date(), nullable=False),
            sa.Column("exit_price_raw", sa.Numeric(18, 4), nullable=False),
            sa.Column("exit_adj_tr", sa.Numeric(18, 6), nullable=False),
            sa.Column("dividends_net_period", sa.Numeric(18, 4), default=0.0),
            sa.Column("gross_return_pct", sa.Float(), nullable=False),
            sa.Column("cost_slippage_pct", sa.Float(), nullable=False),
            sa.Column("net_return_pct", sa.Float(), nullable=False),
            sa.Column("benchmark_return_pct", sa.Float(), nullable=False),
            sa.Column("cdi_return_pct", sa.Float(), nullable=False),
            sa.Column("hit_absolute", sa.Boolean(), nullable=False),
            sa.Column("hit_excess_bench", sa.Boolean(), nullable=False),
            sa.Column("max_adverse_excursion_pct", sa.Float(), nullable=False),
            sa.Column("brier_component", sa.Float(), nullable=False),
            sa.Column("audited_at", sa.DateTime(), nullable=False),
            sa.UniqueConstraint("ledger_id", "horizon_days", name="_soutcome_ledger_h_uc"),
        )


def downgrade() -> None:
    for tbl in (
        "signal_outcomes",
        "signal_ledger",
        "signal_setup_stats",
        "market_regime_daily",
        "fundamental_snapshots",
        "price_history_daily",
    ):
        op.drop_table(tbl)
