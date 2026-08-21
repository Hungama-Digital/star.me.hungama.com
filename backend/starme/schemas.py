from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field


class ServiceState(StrEnum):
    OK = "ok"
    DEGRADED = "degraded"


class OrderState(StrEnum):
    QUEUED = "QUEUED"
    FIRST_LOOK_RENDERING = "FIRST_LOOK_RENDERING"
    AWAITING_FIRST_LOOK = "AWAITING_FIRST_LOOK"
    RETAKE_REQUIRED = "RETAKE_REQUIRED"
    FULL_RENDERING = "FULL_RENDERING"
    READY = "READY"
    FAILED = "FAILED"
    CANCELED = "CANCELED"


class JobState(StrEnum):
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    COMPLETE = "COMPLETE"
    FAILED = "FAILED"
    CANCELED = "CANCELED"


class HealthResponse(BaseModel):
    service: str = "starme-api"
    status: ServiceState
    environment: str
    version: str


class CapabilityResponse(BaseModel):
    model_config = ConfigDict(frozen=True)
    catalogue: bool = True
    identity_capture: bool = False
    consent_collection: bool = False
    rendering: bool = False
    media_delivery: bool = False
    consent_version: str | None = None
    legal_text_status: str = "pending_final_legal_wording"
    reason: str


class SyntheticShell(BaseModel):
    model_config = ConfigDict(frozen=True)
    id: str
    title: str
    concept: str
    enabled_role: str
    episode_count: int
    synthetic_fixture: bool = True
    # Content-owner metadata for the real render pipeline: the manifest
    # character name of the replaceable role, how to describe that person to
    # the edit model, and the scene-lock notes appended to the swap prompt.
    # Never inferred from pixels.
    role_character: str = ""
    role_video_desc: str = ""
    role_render_notes: str = ""


class IssueAccessCodeRequest(BaseModel):
    tester_reference: str = Field(min_length=2, max_length=100)
    expires_in_hours: int = Field(default=24, ge=1, le=168)


class IssueAccessCodeResponse(BaseModel):
    code: str
    expires_at: datetime


class RedeemAccessCodeRequest(BaseModel):
    code: str = Field(min_length=8, max_length=100)
    device_id: str = Field(min_length=8, max_length=255)


class SessionResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"  # noqa: S105 - OAuth token type, not a credential
    expires_at: datetime


class ConsentCreateRequest(BaseModel):
    typed_name: str = Field(min_length=2, max_length=100)
    consent_version: str = Field(min_length=2, max_length=50)
    checked_likeness: bool
    checked_revocation: bool
    signature_attested: bool


class ConsentResponse(BaseModel):
    reference: str
    consent_version: str
    accepted_at: datetime
    revoked_at: datetime | None = None
    deletion_requested_at: datetime | None = None
    legal_text_status: str = "pending_final_legal_wording"


class OrderCreateRequest(BaseModel):
    consent_reference: str
    shell_id: str
    role_id: str
    package_id: str = "lead-debut-3"
    face_asset_id: str


class FirstLookResponse(BaseModel):
    status: str
    preview_url: str | None = None


class EpisodeResponse(BaseModel):
    episode_number: int
    checksum_sha256: str
    stream_url: str
    download_url: str


class JobResponse(BaseModel):
    id: str
    kind: str
    status: str
    attempt_count: int
    failure_reason: str | None


class OrderResponse(BaseModel):
    id: str
    status: OrderState
    shell_id: str
    role_id: str
    package_id: str
    first_look: FirstLookResponse | None
    jobs: list[JobResponse]
    episodes: list[EpisodeResponse]


class FirstLookDecision(StrEnum):
    APPROVE = "APPROVE"
    RETAKE = "RETAKE"


class FirstLookDecisionRequest(BaseModel):
    decision: FirstLookDecision


class RevocationResponse(BaseModel):
    consent_reference: str
    canceled_orders: int
    canceled_jobs: int
    deletion_requested_at: datetime
