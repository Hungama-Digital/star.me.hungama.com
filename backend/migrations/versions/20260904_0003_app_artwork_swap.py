"""App selfie upload and artwork face swap.

Revision ID: 20260904_0003
Revises: 20260806_0002
Create Date: 2026-09-04
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260904_0003"
down_revision: str | None = "20260806_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "app_selfies",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("tester_reference", sa.String(100), nullable=False, index=True),
        sa.Column("display_name", sa.String(100), nullable=False),
        sa.Column("name_slug", sa.String(100), nullable=False, index=True),
        sa.Column("object_key", sa.String(255), nullable=False, unique=True),
        sa.Column("public_url", sa.String(500), nullable=False),
        sa.Column("content_type", sa.String(100), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("checksum_sha256", sa.String(64), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "artwork_swaps",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("tester_reference", sa.String(100), nullable=False, index=True),
        sa.Column(
            "selfie_id",
            sa.String(36),
            sa.ForeignKey("app_selfies.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.Column("source_image_url", sa.String(500), nullable=False),
        sa.Column("shell_id", sa.String(100), nullable=False, index=True),
        sa.Column("artwork_url", sa.String(500), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, index=True),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("result_object_key", sa.String(255), nullable=True),
        sa.Column("result_url", sa.String(500), nullable=True),
        sa.Column("failure_reason", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("artwork_swaps")
    op.drop_table("app_selfies")
