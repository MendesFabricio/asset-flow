"""Add AssetTransaction

Revision ID: f902a0c71057
Revises: 3d7520742986
Create Date: 2026-07-17 00:08:01.479593

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f902a0c71057'
down_revision: Union[str, Sequence[str], None] = '3d7520742986'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    import sqlalchemy as _sa
    bind = op.get_bind()
    inspector = _sa.inspect(bind)
    if 'asset_transactions' not in inspector.get_table_names():
        op.create_table('asset_transactions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('position_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('ticker', sa.String(), nullable=False),
        sa.Column('type', sa.String(), nullable=False),
        sa.Column('quantity', sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column('unit_price', sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column('total_value', sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column('transaction_date', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['position_id'], ['positions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
        )
    indexes = {idx['name'] for idx in inspector.get_indexes('asset_transactions')} if 'asset_transactions' in inspector.get_table_names() else set()
    if str(op.f('ix_asset_transactions_position_id')) not in indexes:
        op.create_index(op.f('ix_asset_transactions_position_id'), 'asset_transactions', ['position_id'], unique=False)
    if str(op.f('ix_asset_transactions_ticker')) not in indexes:
        op.create_index(op.f('ix_asset_transactions_ticker'), 'asset_transactions', ['ticker'], unique=False)
    if str(op.f('ix_asset_transactions_user_id')) not in indexes:
        op.create_index(op.f('ix_asset_transactions_user_id'), 'asset_transactions', ['user_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    import sqlalchemy as _sa
    bind = op.get_bind()
    inspector = _sa.inspect(bind)
    if 'asset_transactions' in inspector.get_table_names():
        indexes = {idx['name'] for idx in inspector.get_indexes('asset_transactions')}
        if str(op.f('ix_asset_transactions_user_id')) in indexes:
            op.drop_index(op.f('ix_asset_transactions_user_id'), table_name='asset_transactions')
        if str(op.f('ix_asset_transactions_ticker')) in indexes:
            op.drop_index(op.f('ix_asset_transactions_ticker'), table_name='asset_transactions')
        if str(op.f('ix_asset_transactions_position_id')) in indexes:
            op.drop_index(op.f('ix_asset_transactions_position_id'), table_name='asset_transactions')
        op.drop_table('asset_transactions')
