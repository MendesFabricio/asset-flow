"""round2_audit_fixes

Revision ID: f1a2b3c4d5e6
Revises: 571144909f61
Create Date: 2026-11-15 10:40:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = 'f1a2b3c4d5e6'
down_revision: Union[str, Sequence[str], None] = '571144909f61'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Adiciona constraint única (user_id, date) em snapshots e remove índices duplicados."""
    op.execute(
        "DELETE FROM snapshots WHERE id NOT IN "
        "(SELECT MAX(id) FROM snapshots GROUP BY user_id, date)"
    )
    op.create_index(
        '_user_date_snapshot_uc',
        'snapshots',
        ['user_id', 'date'],
        unique=True,
        if_not_exists=True,
    )
    op.drop_index('idx_asset_tx_user_date', table_name='asset_transactions', if_exists=True)
    op.drop_index('idx_dividends_asset_date', table_name='dividends', if_exists=True)


def downgrade() -> None:
    """Reverte índice único de snapshots e recria índices anteriores."""
    op.drop_index('_user_date_snapshot_uc', table_name='snapshots', if_exists=True)
    op.create_index(
        'idx_dividends_asset_date',
        'dividends',
        ['asset_id', 'date_com'],
        unique=False,
        if_not_exists=True,
    )
    op.create_index(
        'idx_asset_tx_user_date',
        'asset_transactions',
        ['user_id', 'transaction_date'],
        unique=False,
        if_not_exists=True,
    )
