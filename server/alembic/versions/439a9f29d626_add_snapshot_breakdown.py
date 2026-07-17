"""add_snapshot_breakdown

Revision ID: 439a9f29d626
Revises: 2a5f3c8e1d4b
Create Date: 2026-07-13 14:12:26.393984

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '439a9f29d626'
down_revision: Union[str, Sequence[str], None] = '2a5f3c8e1d4b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    import sqlalchemy as _sa
    bind = op.get_bind()
    inspector = _sa.inspect(bind)
    if 'snapshots' in inspector.get_table_names():
        columns = {col['name'] for col in inspector.get_columns('snapshots')}
        if 'breakdown' not in columns:
            op.add_column('snapshots', sa.Column('breakdown', sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    import sqlalchemy as _sa
    bind = op.get_bind()
    inspector = _sa.inspect(bind)
    if 'snapshots' in inspector.get_table_names():
        columns = {col['name'] for col in inspector.get_columns('snapshots')}
        if 'breakdown' in columns:
            with op.batch_alter_table('snapshots') as batch_op:
                batch_op.drop_column('breakdown')
