"""Both aspects from one artwork swap: add the landscape columns.

The App shows the personalised key art in a portrait slot and a landscape
slot, so one job now produces both. result_* stays the portrait output, which
is why nothing is dropped or renamed here.

Revision ID: 20260904_0004
Revises: 20260904_0003
Create Date: 2026-09-04
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260904_0004"
down_revision: str | None = "20260904_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "artwork_swaps",
        sa.Column("landscape_artwork_url", sa.String(500), nullable=True),
    )
    op.add_column(
        "artwork_swaps",
        sa.Column("landscape_object_key", sa.String(255), nullable=True),
    )
    op.add_column(
        "artwork_swaps", sa.Column("landscape_url", sa.String(500), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("artwork_swaps", "landscape_url")
    op.drop_column("artwork_swaps", "landscape_object_key")
    op.drop_column("artwork_swaps", "landscape_artwork_url")
