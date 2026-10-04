"""Third artwork output: the subscriber as the show's character.

Additive and nullable, like the landscape pair before it, so existing rows
stay valid and the deploy needs no backfill: a job that ran before this
migration simply reports character_url as null.

Revision ID: 20261004_0005
Revises: 20260904_0004
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20261004_0005"
down_revision: str | None = "20260904_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "artwork_swaps",
        sa.Column("character_object_key", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "artwork_swaps",
        sa.Column("character_url", sa.String(length=500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("artwork_swaps", "character_url")
    op.drop_column("artwork_swaps", "character_object_key")
