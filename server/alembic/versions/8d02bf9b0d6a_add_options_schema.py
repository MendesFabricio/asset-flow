"""add_options_schema

Revision ID: 8d02bf9b0d6a
Revises: c09ce9bdd397
Create Date: 2026-07-22 20:11:11.372501

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8d02bf9b0d6a'
down_revision: Union[str, Sequence[str], None] = 'c09ce9bdd397'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('asset_transactions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('is_option', sa.Boolean(), nullable=True))
        batch_op.add_column(sa.Column('option_meta', sa.JSON(), nullable=True))

    with op.batch_alter_table('corporate_events', schema=None) as batch_op:
        batch_op.add_column(sa.Column('cost_percent', sa.Numeric(precision=18, scale=4), nullable=True))
        batch_op.add_column(sa.Column('raw_data', sa.JSON(), nullable=True))

    # ### end Alembic commands ###


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('corporate_events', schema=None) as batch_op:
        batch_op.drop_column('raw_data')
        batch_op.drop_column('cost_percent')

    with op.batch_alter_table('asset_transactions', schema=None) as batch_op:
        batch_op.drop_column('option_meta')
        batch_op.drop_column('is_option')

    # ### end Alembic commands ###
