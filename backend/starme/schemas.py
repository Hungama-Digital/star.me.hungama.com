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


class ListingArtwork(BaseModel):
    landscape: str
    portrait: str


class ListingCastMember(BaseModel):
    #: "NA" rather than null or an omitted entry: the App renders this list
    #: directly, and a missing key there is a crash where a placeholder string
    #: is just a blank row.
    name: str
    image: str


class ListingItem(BaseModel):
    """One show on the App's listing screen.

    Editorial metadata, not derived from the render pipeline: `content_id` is
    the distribution barcode the rest of Hungama keys on, which is why it is a
    string and not the `shell_id` the swap endpoints use.
    """

    content_id: str
    content_title: str
    content_type: str
    content_genre: str
    actor: str
    age_rating: str
    audio_language: str
    #: ISO date as a plain string, so the App gets exactly what was authored
    #: rather than a timezone-shifted datetime.
    release_date: str
    year_of_release: int
    original_show_name: str
    artwork: ListingArtwork
    cast: list[ListingCastMember]


class ArtworkSwapBatchCreateRequest(BaseModel):
    """One selfie, several series. One job is created per series.

    Deliberately separate from ArtworkSwapCreateRequest rather than widening
    it: the App already ships against the single-shell call, whose response is
    one object, and a batch has to answer with a list.
    """

    #: Series to swap onto, in the order the App wants them back. Duplicates
    #: are collapsed, because sending a series twice would bill the image
    #: model twice for the same picture.
    shell_ids: list[str] = Field(min_length=1, max_length=20)
    selfie_id: str | None = None
    image_url: str | None = Field(default=None, max_length=500)


class ArtworkSwapBatchResponse(BaseModel):
    jobs: list["ArtworkSwapResponse"]
    #: Null only once EVERY job is terminal, so the App can poll the batch the
    #: same way it polls one job: wait, re-read, stop when this goes null.
    poll_after_seconds: int | None = None
    #: Series that were asked for but produced no job, with the reason. The
    #: rest of the batch still runs; a single bad name does not sink it.
    skipped: dict[str, str] = Field(default_factory=dict)


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


ArtworkSwapBatchResponse.model_rebuild()
