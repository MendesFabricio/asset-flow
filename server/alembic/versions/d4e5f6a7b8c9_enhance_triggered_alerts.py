"""Enhance triggered_alerts with user_id, asset_id and event_type

Revision ID: d4e5f6a7b8c9
Revises: b2c3d4e5f6a1
Create Date: 2026-11-21 14:25:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, Sequence[str], None] = "b2c3d4e5f6a1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_cols = {col["name"] for col in inspector.get_columns("triggered_alerts")}

    with op.batch_alter_table("triggered_alerts") as batch_op:
        if "user_id" not in existing_cols:
            batch_op.add_column(sa.Column("user_id", sa.Integer(), nullable=True))
            batch_op.create_index("ix_triggered_alerts_user_id", ["user_id"])
        if "asset_id" not in existing_cols:
            batch_op.add_column(sa.Column("asset_id", sa.Integer(), nullable=True))
        if "event_type" not in existing_cols:
            batch_op.add_column(sa.Column("event_type", sa.String(length=32), nullable=True))

    op.execute("UPDATE triggered_alerts SET user_id = 1 WHERE user_id IS NULL")
    op.execute(
        "UPDATE triggered_alerts SET event_type = CASE "
        "WHEN condition = 'SIGNAL_CHANGE' THEN 'SIGNAL_CHANGE' "
        "WHEN condition = 'DIVIDEND_ANNOUNCED' THEN 'DIVIDEND_ANNOUNCED' "
        "ELSE 'PRICE_ALERT' END "
        "WHERE event_type IS NULL"
    )


def downgrade() -> None:
    with op.batch_alter_table("triggered_alerts") as batch_op:
        batch_op.drop_index("ix_triggered_alerts_user_id")
        batch_op.drop_column("event_type")
        batch_op.drop_column("asset_id")
        batch_op.drop_column("user_id")
