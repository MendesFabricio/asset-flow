"""add_credit_risk_fields

Revision ID: affbf294de48
Revises: f902a0c71057
Create Date: 2026-07-20 15:12:31.458031

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'affbf294de48'
down_revision: Union[str, Sequence[str], None] = 'f902a0c71057'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    conn = op.get_bind()
    insp = sa.inspect(conn)
    columns = [c['name'] for c in insp.get_columns('assets')]
    
    if 'credit_rating' not in columns:
        op.add_column('assets', sa.Column('credit_rating', sa.String(), nullable=True))
    if 'duration_years' not in columns:
        op.add_column('assets', sa.Column('duration_years', sa.Float(), nullable=True))
    if 'indexer_cdi_pct' not in columns:
        op.add_column('assets', sa.Column('indexer_cdi_pct', sa.Float(), nullable=True))
    if 'indexer_ipca_pct' not in columns:
        op.add_column('assets', sa.Column('indexer_ipca_pct', sa.Float(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('assets', 'credit_rating')
    op.drop_column('assets', 'duration_years')
    op.drop_column('assets', 'indexer_cdi_pct')
    op.drop_column('assets', 'indexer_ipca_pct')
