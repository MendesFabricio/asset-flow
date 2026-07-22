"""Add CorporateEvent and Dividend type

Revision ID: c09ce9bdd397
Revises: 94d37fc6c37c
Create Date: 2026-07-22 19:33:24.422328

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c09ce9bdd397'
down_revision: Union[str, Sequence[str], None] = '94d37fc6c37c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create corporate_events table
    op.create_table('corporate_events',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('asset_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('type', sa.String(), nullable=False),
        sa.Column('factor', sa.Numeric(precision=18, scale=4), nullable=True),
        sa.Column('percent', sa.Numeric(precision=18, scale=4), nullable=True),
        sa.Column('unit_cost', sa.Numeric(precision=18, scale=4), nullable=True),
        sa.Column('new_ticker', sa.String(), nullable=True),
        sa.Column('received_qty', sa.Numeric(precision=18, scale=4), nullable=True),
        sa.Column('date', sa.Date(), nullable=True),
        sa.Column('source', sa.String(), nullable=True),
        sa.ForeignKeyConstraint(['asset_id'], ['assets.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('corporate_events', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_corporate_events_asset_id'), ['asset_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_corporate_events_date'), ['date'], unique=False)
        batch_op.create_index(batch_op.f('ix_corporate_events_user_id'), ['user_id'], unique=False)

    # 2. Add corporate_event_id to asset_transactions
    with op.batch_alter_table('asset_transactions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('corporate_event_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key('fk_asset_transactions_corporate_event_id', 'corporate_events', ['corporate_event_id'], ['id'], ondelete='SET NULL')
        batch_op.create_index(batch_op.f('ix_asset_transactions_corporate_event_id'), ['corporate_event_id'], unique=False)

    # 3. Add type and unique constraint to dividends
    with op.batch_alter_table('dividends', schema=None) as batch_op:
        batch_op.add_column(sa.Column('type', sa.String(), server_default='Dividendo', nullable=True))
        batch_op.create_unique_constraint('_dividend_unique_uc', ['user_id', 'asset_id', 'date_payment', 'type', 'total_value'])

def downgrade() -> None:
    with op.batch_alter_table('dividends', schema=None) as batch_op:
        batch_op.drop_constraint('_dividend_unique_uc', type_='unique')
        batch_op.drop_column('type')

    with op.batch_alter_table('asset_transactions', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_asset_transactions_corporate_event_id'))
        batch_op.drop_constraint('fk_asset_transactions_corporate_event_id', type_='foreignkey')
        batch_op.drop_column('corporate_event_id')

    with op.batch_alter_table('corporate_events', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_corporate_events_user_id'))
        batch_op.drop_index(batch_op.f('ix_corporate_events_date'))
        batch_op.drop_index(batch_op.f('ix_corporate_events_asset_id'))

    op.drop_table('corporate_events')
