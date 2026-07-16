"""drop_snapshot_items

Revision ID: ca873db2979f
Revises: 09c37de86bab
Create Date: 2026-07-15 23:12:15.129604

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "ca873db2979f"
down_revision: Union[str, Sequence[str], None] = "09c37de86bab"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    conn = op.get_bind()
    from sqlalchemy import inspect
    inspector = inspect(conn)
    if 'snapshot_items' in inspector.get_table_names():
        op.drop_table("snapshot_items")

def downgrade() -> None:
    op.create_table("snapshot_items",
    sa.Column("id", sa.INTEGER(), nullable=False),
    sa.Column("snapshot_id", sa.INTEGER(), nullable=False),
    sa.Column("category_id", sa.INTEGER(), nullable=False),
    sa.Column("total_value", sa.NUMERIC(precision=18, scale=4), nullable=False),
    sa.Column("target_percent", sa.NUMERIC(precision=18, scale=4), nullable=True),
    sa.ForeignKeyConstraint(["category_id"], ["categories.id"], ondelete="CASCADE"),
    sa.ForeignKeyConstraint(["snapshot_id"], ["snapshots.id"], ondelete="CASCADE"),
    sa.PrimaryKeyConstraint("id")
    )
    op.create_index(op.f("ix_snapshot_items_snapshot_id"), "snapshot_items", ["snapshot_id"], unique=False)
    op.create_index(op.f("ix_snapshot_items_category_id"), "snapshot_items", ["category_id"], unique=False)
