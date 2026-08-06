"""Add authenticated prototype workflow domains.

Revision ID: 20260806_0002
Revises: 20260806_0001
Create Date: 2026-08-06
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260806_0002"
down_revision: str | None = "20260806_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "access_codes",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("code_digest", sa.String(64), nullable=False, unique=True),
        sa.Column("tester_reference", sa.String(100), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("issued_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("consumed_at", sa.DateTime(timezone=True)),
        sa.Column("device_digest", sa.String(64)),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_access_codes_code_digest", "access_codes", ["code_digest"])
    op.create_index("ix_access_codes_tester_reference", "access_codes", ["tester_reference"])
    op.create_table(
        "client_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("token_digest", sa.String(64), nullable=False, unique=True),
        sa.Column("tester_reference", sa.String(100), nullable=False),
        sa.Column("device_digest", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_client_sessions_token_digest", "client_sessions", ["token_digest"])
    op.create_index("ix_client_sessions_tester_reference", "client_sessions", ["tester_reference"])
    op.create_table(
        "consent_records",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("reference", sa.String(40), nullable=False, unique=True),
        sa.Column("tester_reference", sa.String(100), nullable=False),
        sa.Column("typed_name", sa.String(100), nullable=False),
        sa.Column("consent_version", sa.String(50), nullable=False),
        sa.Column("signature_attested", sa.Boolean(), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("deletion_requested_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_consent_records_reference", "consent_records", ["reference"])
    op.create_index("ix_consent_records_tester_reference", "consent_records", ["tester_reference"])
    op.create_table(
        "orders",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("tester_reference", sa.String(100), nullable=False),
        sa.Column("consent_id", sa.String(36), sa.ForeignKey("consent_records.id"), nullable=False),
        sa.Column("shell_id", sa.String(100), nullable=False),
        sa.Column("role_id", sa.String(100), nullable=False),
        sa.Column("package_id", sa.String(100), nullable=False),
        sa.Column("face_asset_id", sa.String(255), nullable=False),
        sa.Column("status", sa.String(40), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_orders_tester_reference", "orders", ["tester_reference"])
    op.create_index("ix_orders_status", "orders", ["status"])
    op.create_table(
        "render_jobs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("order_id", sa.String(36), sa.ForeignKey("orders.id", ondelete="CASCADE")),
        sa.Column("kind", sa.String(30), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failure_reason", sa.Text()),
        sa.Column("provider_reference", sa.String(255)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_render_jobs_order_id", "render_jobs", ["order_id"])
    op.create_index("ix_render_jobs_status", "render_jobs", ["status"])
    op.create_table(
        "first_looks",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "order_id",
            sa.String(36),
            sa.ForeignKey("orders.id", ondelete="CASCADE"),
            unique=True,
        ),
        sa.Column("object_key", sa.String(255), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("decided_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_first_looks_order_id", "first_looks", ["order_id"])
    op.create_table(
        "episode_outputs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("order_id", sa.String(36), sa.ForeignKey("orders.id", ondelete="CASCADE")),
        sa.Column("episode_number", sa.Integer(), nullable=False),
        sa.Column("object_key", sa.String(255), nullable=False),
        sa.Column("checksum_sha256", sa.String(64), nullable=False),
        sa.UniqueConstraint("order_id", "episode_number"),
    )
    op.create_index("ix_episode_outputs_order_id", "episode_outputs", ["order_id"])


def downgrade() -> None:
    for table in [
        "episode_outputs",
        "first_looks",
        "render_jobs",
        "orders",
        "consent_records",
        "client_sessions",
        "access_codes",
    ]:
        op.drop_table(table)
