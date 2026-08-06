import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from starme.database import Base


def new_id() -> str:
    return str(uuid.uuid4())


class AccessCode(Base):
    __tablename__ = "access_codes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    code_digest: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    tester_reference: Mapped[str] = mapped_column(String(100), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    device_digest: Mapped[str | None] = mapped_column(String(64))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ClientSession(Base):
    __tablename__ = "client_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    token_digest: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    tester_reference: Mapped[str] = mapped_column(String(100), index=True)
    device_digest: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ConsentRecord(Base):
    __tablename__ = "consent_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    reference: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    tester_reference: Mapped[str] = mapped_column(String(100), index=True)
    typed_name: Mapped[str] = mapped_column(String(100))
    consent_version: Mapped[str] = mapped_column(String(50))
    signature_attested: Mapped[bool] = mapped_column(Boolean)
    accepted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deletion_requested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    tester_reference: Mapped[str] = mapped_column(String(100), index=True)
    consent_id: Mapped[str] = mapped_column(ForeignKey("consent_records.id", ondelete="RESTRICT"))
    shell_id: Mapped[str] = mapped_column(String(100))
    role_id: Mapped[str] = mapped_column(String(100))
    package_id: Mapped[str] = mapped_column(String(100))
    face_asset_id: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(40), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    consent: Mapped[ConsentRecord] = relationship()
    jobs: Mapped[list["RenderJob"]] = relationship(back_populates="order")
    first_look: Mapped["FirstLook | None"] = relationship(back_populates="order")
    episodes: Mapped[list["EpisodeOutput"]] = relationship(back_populates="order")


class RenderJob(Base):
    __tablename__ = "render_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(30))
    status: Mapped[str] = mapped_column(String(30), index=True)
    priority: Mapped[int] = mapped_column(Integer)
    attempt_count: Mapped[int] = mapped_column(Integer, default=0)
    failure_reason: Mapped[str | None] = mapped_column(Text)
    provider_reference: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    order: Mapped[Order] = relationship(back_populates="jobs")


class FirstLook(Base):
    __tablename__ = "first_looks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    order_id: Mapped[str] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), unique=True, index=True
    )
    object_key: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(30))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    order: Mapped[Order] = relationship(back_populates="first_look")


class EpisodeOutput(Base):
    __tablename__ = "episode_outputs"
    __table_args__ = (UniqueConstraint("order_id", "episode_number"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    episode_number: Mapped[int] = mapped_column(Integer)
    object_key: Mapped[str] = mapped_column(String(255))
    checksum_sha256: Mapped[str] = mapped_column(String(64))
    order: Mapped[Order] = relationship(back_populates="episodes")


class AuditEvent(Base):
    """Append-only record for security and business-sensitive actions."""

    __tablename__ = "audit_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    event_type: Mapped[str] = mapped_column(String(100), index=True)
    actor_type: Mapped[str] = mapped_column(String(50))
    actor_reference: Mapped[str | None] = mapped_column(String(255))
    subject_type: Mapped[str] = mapped_column(String(50))
    subject_reference: Mapped[str] = mapped_column(String(255), index=True)
    correlation_id: Mapped[str] = mapped_column(String(100), index=True)
    payload_json: Mapped[str] = mapped_column(Text, default="{}")
