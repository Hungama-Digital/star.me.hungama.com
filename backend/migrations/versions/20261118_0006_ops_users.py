"""Ops CMS sign-in: team accounts and their sessions.

Revision ID: 20261118_0006
Revises: 20261004_0005
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20261118_0006"
down_revision: str | None = "20261004_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ops_users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("failed_logins", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("disabled_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_ops_users_email", "ops_users", ["email"], unique=True)
    op.create_table(
        "ops_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("token_digest", sa.String(64), nullable=False),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("ops_users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_ops_sessions_token_digest", "ops_sessions", ["token_digest"], unique=True)
    op.create_index("ix_ops_sessions_user_id", "ops_sessions", ["user_id"])


def downgrade() -> None:
    op.drop_table("ops_sessions")
    op.drop_table("ops_users")
