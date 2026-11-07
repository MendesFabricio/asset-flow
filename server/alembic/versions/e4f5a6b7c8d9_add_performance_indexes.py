"""add_performance_indexes

Revision ID: e4f5a6b7c8d9
Revises: 8d02bf9b0d6a
Create Date: 2026-07-25 14:10:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'e4f5a6b7c8d9'
down_revision: Union[str, Sequence[str], None] = '8d02bf9b0d6a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('positions', schema=None) as batch_op:
        batch_op.create_index('idx_positions_user_asset', ['user_id', 'asset_id'], unique=False, if_not_exists=True)

    with op.batch_alter_table('asset_transactions', schema=None) as batch_op:
        batch_op.create_index('idx_asset_tx_user_date', ['user_id', 'transaction_date'], unique=False, if_not_exists=True)

    with op.batch_alter_table('dividends', schema=None) as batch_op:
        batch_op.create_index('idx_dividends_asset_date', ['asset_id', 'date_com'], unique=False, if_not_exists=True)

    with op.batch_alter_table('market_data', schema=None) as batch_op:
        batch_op.create_index('idx_market_data_asset_date', ['asset_id', 'date'], unique=False, if_not_exists=True)

def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('market_data', schema=None) as batch_op:
        batch_op.drop_index('idx_market_data_asset_date', if_exists=True)

    with op.batch_alter_table('dividends', schema=None) as batch_op:
        batch_op.drop_index('idx_dividends_asset_date', if_exists=True)

    with op.batch_alter_table('asset_transactions', schema=None) as batch_op:
        batch_op.drop_index('idx_asset_tx_user_date', if_exists=True)

    with op.batch_alter_table('positions', schema=None) as batch_op:
        batch_op.drop_index('idx_positions_user_asset', if_exists=True)
