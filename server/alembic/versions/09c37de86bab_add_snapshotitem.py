"""Add SnapshotItem

Revision ID: 09c37de86bab
Revises: 439a9f29d626
Create Date: 2026-07-15 02:07:16.438482

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '09c37de86bab'
down_revision: Union[str, Sequence[str], None] = '439a9f29d626'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    import sqlalchemy as _sa
    bind = op.get_bind()
    inspector = _sa.inspect(bind)
    if 'snapshot_items' not in inspector.get_table_names():
        op.create_table('snapshot_items',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('snapshot_id', sa.Integer(), nullable=False),
        sa.Column('category_id', sa.Integer(), nullable=False),
        sa.Column('total_value', sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column('target_percent', sa.Numeric(precision=18, scale=4), nullable=True),
        sa.ForeignKeyConstraint(['category_id'], ['categories.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['snapshot_id'], ['snapshots.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
        )
    indexes = {idx['name'] for idx in inspector.get_indexes('snapshot_items')} if 'snapshot_items' in inspector.get_table_names() else set()
    if str(op.f('ix_snapshot_items_category_id')) not in indexes:
        op.create_index(op.f('ix_snapshot_items_category_id'), 'snapshot_items', ['category_id'], unique=False)
    if str(op.f('ix_snapshot_items_snapshot_id')) not in indexes:
        op.create_index(op.f('ix_snapshot_items_snapshot_id'), 'snapshot_items', ['snapshot_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    import sqlalchemy as _sa
    bind = op.get_bind()
    inspector = _sa.inspect(bind)
    if 'snapshot_items' in inspector.get_table_names():
        indexes = {idx['name'] for idx in inspector.get_indexes('snapshot_items')}
        if str(op.f('ix_snapshot_items_snapshot_id')) in indexes:
            op.drop_index(op.f('ix_snapshot_items_snapshot_id'), table_name='snapshot_items')
        if str(op.f('ix_snapshot_items_category_id')) in indexes:
            op.drop_index(op.f('ix_snapshot_items_category_id'), table_name='snapshot_items')
        op.drop_table('snapshot_items')
