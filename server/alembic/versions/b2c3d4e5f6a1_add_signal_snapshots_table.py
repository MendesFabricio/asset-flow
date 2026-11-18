"""add_signal_snapshots_table

Revision ID: b2c3d4e5f6a1
Revises: a1b2c3d4e5f7
Create Date: 2026-11-18 16:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b2c3d4e5f6a1'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if 'signal_snapshots' not in inspector.get_table_names():
        op.create_table(
            'signal_snapshots',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
            sa.Column('asset_id', sa.Integer(), sa.ForeignKey('assets.id', ondelete='CASCADE'), nullable=False),
            sa.Column('ticker', sa.String(), nullable=False),
            sa.Column('date', sa.Date(), nullable=False),
            sa.Column('score', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('status', sa.String(), nullable=False),
            sa.Column('recomendacao', sa.String(), nullable=False),
            sa.Column('preco', sa.Numeric(18, 4), nullable=True),
            sa.Column('mg_graham', sa.Numeric(18, 4), nullable=True),
            sa.Column('mg_bazin', sa.Numeric(18, 4), nullable=True),
            sa.Column('p_vp', sa.Numeric(18, 4), nullable=True),
            sa.Column('quality_score', sa.Integer(), nullable=True),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('user_id', 'asset_id', 'date', name='_signal_user_asset_date_uc'),
        )
        op.create_index('ix_signal_snapshots_user_id', 'signal_snapshots', ['user_id'])
        op.create_index('ix_signal_snapshots_ticker', 'signal_snapshots', ['ticker'])
        op.create_index('ix_signal_snapshots_date', 'signal_snapshots', ['date'])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if 'signal_snapshots' in inspector.get_table_names():
        op.drop_table('signal_snapshots')
