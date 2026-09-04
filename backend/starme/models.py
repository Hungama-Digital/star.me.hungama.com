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

class AppSelfie(Base):
    """A selfie the app uploaded, hosted publicly so the app can show it back.

    Separate from the render pipeline's face assets: that path normalises,
    crops and registers a portrait with the video provider under a single
    per-device filename. This one keeps whatever the user sent, under the name
    they typed, and its whole job is to hand back a URL the app can render in
    an <Image>. One device can have several, so the newest is not privileged.
    """

    __tablename__ = "app_selfies"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    tester_reference: Mapped[str] = mapped_column(String(100), index=True)
    display_name: Mapped[str] = mapped_column(String(100))
    #: Filesystem/URL-safe form of display_name, used in the object key.
    name_slug: Mapped[str] = mapped_column(String(100), index=True)
    object_key: Mapped[str] = mapped_column(String(255), unique=True)
    public_url: Mapped[str] = mapped_column(String(500))
    content_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(Integer)
    checksum_sha256: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    swaps: Mapped[list["ArtworkSwap"]] = relationship(back_populates="selfie")


class ArtworkSwap(Base):
    """One request to paint a user's face onto a series' key artwork.

    Asynchronous on purpose: the image model takes tens of seconds, which is
    far longer than a phone request should hold open. Submit returns an id,
    the app polls, and the row carries whichever terminal state it reached so
    a failure is a readable reason rather than a request that never returns.
    """

    __tablename__ = "artwork_swaps"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    tester_reference: Mapped[str] = mapped_column(String(100), index=True)
    selfie_id: Mapped[str | None] = mapped_column(
        ForeignKey("app_selfies.id", ondelete="SET NULL"), index=True
    )
    #: The selfie actually used, kept even if the selfie row is later removed.
    source_image_url: Mapped[str] = mapped_column(String(500))
    shell_id: Mapped[str] = mapped_column(String(100), index=True)
    artwork_url: Mapped[str] = mapped_column(String(500))
    #: queued | running | succeeded | failed
    status: Mapped[str] = mapped_column(String(20), index=True)
    attempt_count: Mapped[int] = mapped_column(Integer, default=0)
    result_object_key: Mapped[str | None] = mapped_column(String(255))
    result_url: Mapped[str | None] = mapped_column(String(500))
    failure_reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    selfie: Mapped["AppSelfie | None"] = relationship(back_populates="swaps")
