"""add_valuation_screener_and_watchlist

Revision ID: a1b2c3d4e5f7
Revises: f1a2b3c4d5e6
Create Date: 2026-11-17 23:40:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'a1b2c3d4e5f7'
down_revision: Union[str, Sequence[str], None] = 'f1a2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Cria tabelas market_screener_items e watchlist_items para Radar B3 e Preço Teto."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table('market_screener_items'):
        op.create_table(
            'market_screener_items',
            sa.Column('ticker', sa.String(), nullable=False),
            sa.Column('name', sa.String(), nullable=True),
            sa.Column('asset_type', sa.String(), nullable=False, server_default='Ação'),
            sa.Column('sector', sa.String(), nullable=True),
            sa.Column('price', sa.Float(), nullable=True),
            sa.Column('change_percent', sa.Float(), nullable=True),
            sa.Column('dy_12m', sa.Float(), nullable=True),
            sa.Column('dy_avg_5y', sa.Float(), nullable=True),
            sa.Column('dividend_per_share', sa.Float(), nullable=True),
            sa.Column('lpa', sa.Float(), nullable=True),
            sa.Column('vpa', sa.Float(), nullable=True),
            sa.Column('pl', sa.Float(), nullable=True),
            sa.Column('pvp', sa.Float(), nullable=True),
            sa.Column('roe', sa.Float(), nullable=True),
            sa.Column('roic', sa.Float(), nullable=True),
            sa.Column('net_margin', sa.Float(), nullable=True),
            sa.Column('ebitda_margin', sa.Float(), nullable=True),
            sa.Column('ev_ebitda', sa.Float(), nullable=True),
            sa.Column('debt_to_ebitda', sa.Float(), nullable=True),
            sa.Column('payout', sa.Float(), nullable=True),
            sa.Column('fcf_per_share', sa.Float(), nullable=True),
            sa.Column('bazin_price', sa.Float(), nullable=True),
            sa.Column('graham_price', sa.Float(), nullable=True),
            sa.Column('gordon_price', sa.Float(), nullable=True),
            sa.Column('dcf_price', sa.Float(), nullable=True),
            sa.Column('quality_score', sa.Integer(), nullable=True),
            sa.Column('magic_score', sa.Float(), nullable=True),
            sa.Column('checklist_json', sa.JSON(), nullable=True),
            sa.Column('raw_metrics_json', sa.JSON(), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint('ticker'),
        )
        op.create_index('ix_market_screener_items_asset_type', 'market_screener_items', ['asset_type'])
        op.create_index('ix_market_screener_items_sector', 'market_screener_items', ['sector'])
        op.create_index('ix_market_screener_items_updated_at', 'market_screener_items', ['updated_at'])

    if not inspector.has_table('watchlist_items'):
        op.create_table(
            'watchlist_items',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('ticker', sa.String(), nullable=False),
            sa.Column('desired_bazin_dy', sa.Float(), nullable=True),
            sa.Column('target_price', sa.Float(), nullable=True),
            sa.Column('notes', sa.String(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('user_id', 'ticker', name='_user_watchlist_ticker_uc'),
        )
        op.create_index('ix_watchlist_items_user_id', 'watchlist_items', ['user_id'])
        op.create_index('ix_watchlist_items_ticker', 'watchlist_items', ['ticker'])


def downgrade() -> None:
    """Remove tabelas do screener e watchlist."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table('watchlist_items'):
        op.drop_table('watchlist_items')
    if inspector.has_table('market_screener_items'):
        op.drop_table('market_screener_items')
