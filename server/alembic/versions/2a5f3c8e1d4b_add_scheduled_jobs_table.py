"""add_scheduled_jobs_table

Revision ID: 2a5f3c8e1d4b
Revises: 70c6edf66856
Create Date: 2026-07-11 01:04:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2a5f3c8e1d4b'
down_revision: Union[str, Sequence[str], None] = '70c6edf66856'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    import sqlalchemy as _sa
    bind = op.get_bind()
    inspector = _sa.inspect(bind)
    if 'scheduled_jobs' not in inspector.get_table_names():
        op.create_table(
            'scheduled_jobs',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('name', sa.String(length=100), nullable=False),
            sa.Column('description', sa.String(length=255), nullable=True),
            sa.Column('job_type', sa.String(length=50), nullable=False),
            sa.Column('cron_expression', sa.String(length=100), nullable=True),
            sa.Column('interval_minutes', sa.Integer(), nullable=True),
            sa.Column('is_active', sa.Boolean(), nullable=True),
            sa.Column('last_run_at', sa.DateTime(), nullable=True),
            sa.Column('last_run_status', sa.String(length=20), nullable=True),
            sa.Column('last_run_message', sa.String(length=255), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('name')
        )


def downgrade() -> None:
    import sqlalchemy as _sa
    bind = op.get_bind()
    inspector = _sa.inspect(bind)
    if 'scheduled_jobs' in inspector.get_table_names():
        op.drop_table('scheduled_jobs')
