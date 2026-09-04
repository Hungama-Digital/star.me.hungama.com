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
    # Filename, under the shell's media directory, of a still showing the
    # ORIGINAL lead actor. Without it the QA gate can only ask "is the
    # subscriber here?", which passes a co-star who was wrongly replaced.
    role_original_portrait: str = ""


class FaceAssetResponse(BaseModel):
    """What the App stores after registering a portrait for this device."""

    face_asset_id: str
    tester_reference: str


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


# ── App: selfie upload and artwork swap ───────────────────────────────────
class SelfieResponse(BaseModel):
    selfie_id: str
    name: str
    image_url: str
    size_bytes: int


class ArtworkSwapCreateRequest(BaseModel):
    shell_id: str = Field(min_length=1, max_length=100)
    #: Either the id returned by the selfie upload, or a URL the App already
    #: has. One of the two is required; selfie_id is preferred because it ties
    #: the job to a stored row.
    selfie_id: str | None = None
    image_url: str | None = Field(default=None, max_length=500)
    #: Overrides where the series artwork is fetched from. Without these the
    #: server looks under the conventional artwork paths for shell_id.
    #: `artwork_url` is the portrait one, named without a prefix because the
    #: App integrated against it before landscape existed.
    artwork_url: str | None = Field(default=None, max_length=500)
    landscape_artwork_url: str | None = Field(default=None, max_length=500)


class ArtworkSwapResponse(BaseModel):
    job_id: str
    status: str
    shell_id: str
    #: Both populated once status is "succeeded". A shell with no landscape
    #: key art still succeeds with portrait_url set and landscape_url null,
    #: so the App must treat landscape as optional rather than assume it.
    portrait_url: str | None = None
    landscape_url: str | None = None
    #: Set when anything failed. Present even on a partial success - portrait
    #: produced, landscape refused - so a half-result is never silent.
    error: str | None = None
    #: How long the App should wait before polling again. None when terminal,
    #: which is the App's signal to stop.
    poll_after_seconds: int | None = None
    attempts: int = 0
