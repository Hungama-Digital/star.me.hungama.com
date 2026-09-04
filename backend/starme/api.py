import hashlib
import hmac
import secrets
from datetime import UTC, datetime
from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    Header,
    HTTPException,
    Response,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse, HTMLResponse
from sqlalchemy import select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, selectinload

from starme import __version__
from starme.artwork import (
    TERMINAL,
    ArtworkError,
    store_selfie,
)
from starme.artwork import submit as submit_artwork_swap
from starme.catalogue import SYNTHETIC_SHELLS
from starme.config import Settings, get_settings
from starme.database import get_session
from starme.delivery import resolve_media_file, signed_url
from starme.jobs import enqueue_artwork_swap, enqueue_first_look, enqueue_full_render
from starme.models import (
    AppSelfie,
    ArtworkSwap,
    ClientSession,
    ConsentRecord,
    Order,
    RenderJob,
)
from starme.schemas import (
    ArtworkSwapCreateRequest,
    ArtworkSwapResponse,
    CapabilityResponse,
    ConsentCreateRequest,
    ConsentResponse,
    EpisodeResponse,
    FaceAssetResponse,
    FirstLookDecision,
    FirstLookDecisionRequest,
    FirstLookResponse,
    HealthResponse,
    JobResponse,
    JobState,
    OrderCreateRequest,
    OrderResponse,
    OrderState,
    RevocationResponse,
    SelfieResponse,
    ServiceState,
    SyntheticShell,
)
from starme.security import open_client, utcnow
from starme.services import audit, cancel_active_jobs, register_face_asset

router = APIRouter()
SettingsDependency = Annotated[Settings, Depends(get_settings)]
SessionDependency = Annotated[Session, Depends(get_session)]


def current_client(
    session: SessionDependency,
    settings: SettingsDependency,
    x_device_id: Annotated[str | None, Header()] = None,
) -> ClientSession:
    """Resolve the caller. Never rejects: the API is open.

    Nothing authenticates any more. The app's tester code screen was removed,
    the access-code and redeem endpoints are gone with it, and every call
    arrived tokenless - 401 on consent, orders and face assets, which is what
    this exists to stop.

    The caller is identified by `X-Device-Id`, which is an identifier and not
    a credential: it is not secret and is not checked against anything. It is
    still needed, because consent and orders are filed per tester_reference
    and one shared reference would let any caller read and revoke another's.
    """
    return open_client(session, x_device_id, settings)


ClientDependency = Annotated[ClientSession, Depends(current_client)]


def owned_order(session: Session, order_id: str, client: ClientSession) -> Order:
    order = session.scalar(
        select(Order)
        .where(Order.id == order_id, Order.tester_reference == client.tester_reference)
        .options(
            selectinload(Order.jobs),
            selectinload(Order.first_look),
            selectinload(Order.episodes),
        )
    )
    if order is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    return order


def order_response(order: Order, settings: Settings) -> OrderResponse:
    first_look = None
    if order.first_look is not None:
        first_look = FirstLookResponse(
            status=order.first_look.status,
            preview_url=signed_url(
                order.first_look.object_key,
                "preview",
                settings.signed_url_ttl_seconds,
                settings,
            ),
        )
    episodes = [
        EpisodeResponse(
            episode_number=episode.episode_number,
            checksum_sha256=episode.checksum_sha256,
            stream_url=signed_url(
                episode.object_key,
                "stream",
                settings.signed_url_ttl_seconds,
                settings,
            ),
            download_url=signed_url(
                episode.object_key,
                "download",
                settings.download_url_ttl_seconds,
                settings,
            ),
        )
        for episode in sorted(order.episodes, key=lambda item: item.episode_number)
    ]
    return OrderResponse(
        id=order.id,
        status=OrderState(order.status),
        shell_id=order.shell_id,
        role_id=order.role_id,
        package_id=order.package_id,
        first_look=first_look,
        jobs=[
            JobResponse(
                id=job.id,
                kind=job.kind,
                status=job.status,
                attempt_count=job.attempt_count,
                failure_reason=job.failure_reason,
            )
            for job in sorted(order.jobs, key=lambda item: item.created_at)
        ],
        episodes=episodes,
    )


@router.get("/health/live", response_model=HealthResponse)
def liveness(settings: SettingsDependency) -> HealthResponse:
    return HealthResponse(
        status=ServiceState.OK,
        environment=settings.environment,
        version=__version__,
    )


@router.get("/health/ready", response_model=HealthResponse)
def readiness(
    response: Response,
    settings: SettingsDependency,
    session: SessionDependency,
) -> HealthResponse:
    state = ServiceState.OK
    try:
        session.execute(text("SELECT 1"))
    except SQLAlchemyError:
        state = ServiceState.DEGRADED
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return HealthResponse(status=state, environment=settings.environment, version=__version__)


@router.get(
    "/v1/byteplus/liveness/callback",
    response_class=HTMLResponse,
    include_in_schema=False,
)
def byteplus_liveness_callback(resultCode: str = "unknown") -> HTMLResponse:  # noqa: N803
    succeeded = resultCode == "10000"
    title = "Verification complete" if succeeded else "Verification was not completed"
    detail = (
        "You can return to StarME. Your verification result will be retrieved securely."
        if succeeded
        else "Please return to StarME and start verification again."
    )
    return HTMLResponse(
        "<!doctype html><html><head><meta name='viewport' content='width=device-width'>"
        f"<title>{title}</title></head><body style='font-family:sans-serif;padding:32px;"
        f"background:#100d18;color:#fff'><h1>{title}</h1><p>{detail}</p></body></html>"
    )


@router.get("/v1/capabilities", response_model=CapabilityResponse)
def capabilities(settings: SettingsDependency) -> CapabilityResponse:
    enabled = settings.sensitive_features_enabled
    return CapabilityResponse(
        identity_capture=enabled,
        consent_collection=True,
        rendering=settings.render_provider in {"stub", "cineiq", "seedance"},
        media_delivery=settings.storage_backend in {"memory", "s3"},
        consent_version=settings.approved_consent_version,
        legal_text_status=(
            "configured" if settings.approved_consent_version else "pending_final_legal_wording"
        ),
        reason=(
            "Sensitive processing is explicitly enabled with configured providers"
            if enabled
            else "Workflow APIs are available; real sensitive processing remains disabled"
        ),
    )


@router.get("/v1/catalogue/shells", response_model=list[SyntheticShell])
def list_synthetic_shells(client: ClientDependency) -> tuple[SyntheticShell, ...]:
    del client
    return SYNTHETIC_SHELLS


@router.post("/v1/consents", response_model=ConsentResponse, status_code=201)
def create_consent(
    request: ConsentCreateRequest,
    client: ClientDependency,
    session: SessionDependency,
    settings: SettingsDependency,
) -> ConsentResponse:
    if not (request.checked_likeness and request.checked_revocation and request.signature_attested):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Complete all consent controls")
    if settings.environment in {"staging", "production"} and (
        settings.approved_consent_version is None
        or request.consent_version != settings.approved_consent_version
    ):
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Legal-approved consent version is not configured",
        )
    reference = f"STARME-{datetime.now(UTC).year}-{secrets.token_hex(3).upper()}"
    consent = ConsentRecord(
        reference=reference,
        tester_reference=client.tester_reference,
        typed_name=request.typed_name,
        consent_version=request.consent_version,
        signature_attested=True,
    )
    session.add(consent)
    audit(session, "consent.accepted", client.tester_reference, "consent", reference)
    session.commit()
    session.refresh(consent)
    return ConsentResponse(
        reference=consent.reference,
        consent_version=consent.consent_version,
        accepted_at=consent.accepted_at,
    )


@router.delete("/v1/consents/{reference}", response_model=RevocationResponse)
def revoke_consent(
    reference: str,
    client: ClientDependency,
    session: SessionDependency,
) -> RevocationResponse:
    consent = session.scalar(
        select(ConsentRecord).where(
            ConsentRecord.reference == reference,
            ConsentRecord.tester_reference == client.tester_reference,
        )
    )
    if consent is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Consent not found")
    now = utcnow()
    consent.revoked_at = now
    consent.deletion_requested_at = now
    orders = session.scalars(
        select(Order).where(
            Order.consent_id == consent.id,
            Order.status.not_in([OrderState.READY, OrderState.CANCELED]),
        )
    ).all()
    canceled_jobs = 0
    for order in orders:
        canceled_jobs += cancel_active_jobs(session, order)
        order.status = OrderState.CANCELED
    audit(session, "consent.revoked", client.tester_reference, "consent", reference)
    session.commit()
    return RevocationResponse(
        consent_reference=reference,
        canceled_orders=len(orders),
        canceled_jobs=canceled_jobs,
        deletion_requested_at=now,
    )


@router.post("/v1/identity/face-assets", response_model=FaceAssetResponse, status_code=201)
def register_face(
    client: ClientDependency,
    settings: SettingsDependency,
    image: Annotated[UploadFile, File()],
) -> FaceAssetResponse:
    """Register the portrait this device will be cast as.

    Serves both App paths - the selfie and the gallery pick - because they are
    the same request: an image that has to reach the provider before an order
    can carry a real face. The photo is normalized (EXIF rotation baked in),
    checked for a findable face, hosted, registered as an asset, and kept for
    the face-QA gate. Until this exists for a device, orders fall back to the
    operator-maintained mapping.
    """
    if not settings.allow_sensitive_processing:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Sensitive processing is not enabled on this environment",
        )
    raw = image.file.read()
    if not raw:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "That photo was empty.")
    try:
        uri = register_face_asset(
            raw=raw, tester_reference=client.tester_reference, settings=settings
        )
    except ValueError as exc:  # the caller can fix these by choosing another photo
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 - provider/storage failure, reported honestly
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, f"Could not register that photo: {exc}"
        ) from exc
    return FaceAssetResponse(face_asset_id=uri, tester_reference=client.tester_reference)


@router.post("/v1/orders", response_model=OrderResponse, status_code=201)
def create_order(
    request: OrderCreateRequest,
    client: ClientDependency,
    session: SessionDependency,
    settings: SettingsDependency,
) -> OrderResponse:
    shell = next((item for item in SYNTHETIC_SHELLS if item.id == request.shell_id), None)
    if shell is None or shell.enabled_role != request.role_id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Shell or role is not enabled")
    if request.package_id != "lead-debut-3":
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Only Lead Debut is enabled")
    if not settings.allow_sensitive_processing and not request.face_asset_id.startswith(
        "synthetic-"
    ):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Only synthetic face assets are accepted until sensitive processing is enabled",
        )
    consent = session.scalar(
        select(ConsentRecord).where(
            ConsentRecord.reference == request.consent_reference,
            ConsentRecord.tester_reference == client.tester_reference,
            ConsentRecord.revoked_at.is_(None),
        )
    )
    if consent is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Active consent is required")
    order = Order(
        tester_reference=client.tester_reference,
        consent_id=consent.id,
        shell_id=request.shell_id,
        role_id=request.role_id,
        package_id=request.package_id,
        face_asset_id=request.face_asset_id,
        status=OrderState.QUEUED,
    )
    session.add(order)
    session.flush()
    job = RenderJob(
        order_id=order.id,
        kind="FIRST_LOOK",
        status=JobState.QUEUED,
        priority=100,
    )
    session.add(job)
    audit(session, "order.created", client.tester_reference, "order", order.id)
    session.commit()
    job_id = job.id
    order_id = order.id
    enqueue_first_look(job_id)
    session.expire_all()
    return order_response(owned_order(session, order_id, client), settings)


@router.get("/v1/orders/{order_id}", response_model=OrderResponse)
def get_order(
    order_id: str,
    client: ClientDependency,
    session: SessionDependency,
    settings: SettingsDependency,
) -> OrderResponse:
    return order_response(owned_order(session, order_id, client), settings)


@router.post("/v1/orders/{order_id}/first-look", response_model=OrderResponse)
def decide_first_look(
    order_id: str,
    request: FirstLookDecisionRequest,
    client: ClientDependency,
    session: SessionDependency,
    settings: SettingsDependency,
) -> OrderResponse:
    order = owned_order(session, order_id, client)
    if order.status != OrderState.AWAITING_FIRST_LOOK or order.first_look is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "First look is not awaiting a decision")
    now = utcnow()
    order.first_look.decided_at = now
    if request.decision == FirstLookDecision.RETAKE:
        order.first_look.status = "RETAKE"
        order.status = OrderState.RETAKE_REQUIRED
        audit(session, "first_look.retake", client.tester_reference, "order", order.id)
        session.commit()
        return order_response(owned_order(session, order_id, client), settings)
    order.first_look.status = "APPROVED"
    job = RenderJob(
        order_id=order.id,
        kind="FULL_RENDER",
        status=JobState.QUEUED,
        priority=10,
    )
    session.add(job)
    audit(session, "first_look.approved", client.tester_reference, "order", order.id)
    session.commit()
    job_id = job.id
    enqueue_full_render(job_id)
    session.expire_all()
    return order_response(owned_order(session, order_id, client), settings)


def artwork_response(row: ArtworkSwap, settings: Settings) -> ArtworkSwapResponse:
    """One shape for all three states, so the App parses one thing.

    ``poll_after_seconds`` is the stop signal: a value means keep polling, and
    None means this is terminal. That keeps the decision on the server, so the
    interval can change later without shipping a new build.

    One job carries both aspects. ``landscape_url`` is null for a shell with
    no landscape key art, and ``error`` then says so - a partial result still
    reports "succeeded", because one usable image beats none.
    """
    terminal = row.status in TERMINAL
    return ArtworkSwapResponse(
        job_id=row.id,
        status=row.status,
        shell_id=row.shell_id,
        portrait_url=row.result_url,
        landscape_url=row.landscape_url,
        error=row.failure_reason,
        poll_after_seconds=None if terminal else settings.artwork_poll_seconds,
        attempts=row.attempt_count,
    )


@router.post("/v1/app/selfies", response_model=SelfieResponse, status_code=201)
def upload_selfie(
    client: ClientDependency,
    session: SessionDependency,
    settings: SettingsDependency,
    name: Annotated[str, Form()],
    image: Annotated[UploadFile, File()],
) -> SelfieResponse:
    """API 1. Publish the user's selfie and hand back a public URL.

    The App uses the returned ``image_url`` directly wherever it wants to show
    the user's own face - no second call, no bytes to keep. The row records
    the name typed during onboarding alongside the id, so a selfie can be
    traced back to a person later.
    """
    raw = image.file.read()
    try:
        stored = store_selfie(
            session,
            raw=raw,
            display_name=name,
            content_type=image.content_type or "",
            tester_reference=client.tester_reference,
            settings=settings,
        )
    except ArtworkError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    audit(session, "selfie.uploaded", client.tester_reference, "selfie", stored.selfie_id,
          {"name": stored.display_name, "bytes": stored.size_bytes})
    session.commit()
    return SelfieResponse(
        selfie_id=stored.selfie_id,
        name=stored.display_name,
        image_url=stored.public_url,
        size_bytes=stored.size_bytes,
    )


@router.post("/v1/app/artwork-swaps", response_model=ArtworkSwapResponse, status_code=202)
def create_artwork_swap(
    request: ArtworkSwapCreateRequest,
    client: ClientDependency,
    session: SessionDependency,
    settings: SettingsDependency,
) -> ArtworkSwapResponse:
    """API 2. Ask for the user's face on a series' artwork.

    Returns 202 with a job id immediately: the image model takes tens of
    seconds, which is far too long to hold a phone request open. The App then
    polls API 3 until ``poll_after_seconds`` comes back null.
    """
    selfie: AppSelfie | None = None
    if request.selfie_id:
        selfie = session.scalar(
            select(AppSelfie).where(
                AppSelfie.id == request.selfie_id,
                AppSelfie.tester_reference == client.tester_reference,
            )
        )
        if selfie is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Selfie not found")
    try:
        row = submit_artwork_swap(
            session,
            tester_reference=client.tester_reference,
            shell_id=request.shell_id,
            selfie=selfie,
            image_url=request.image_url,
            artwork_url=request.artwork_url,
            landscape_artwork_url=request.landscape_artwork_url,
            settings=settings,
        )
    except ArtworkError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    audit(session, "artwork_swap.requested", client.tester_reference, "artwork_swap", row.id,
          {"shell_id": row.shell_id})
    session.commit()
    swap_id = row.id
    # Queued after the commit so the worker cannot start on a row that is not
    # visible yet - and inline mode runs it right here, which is why the
    # response is re-read from the database afterwards.
    enqueue_artwork_swap(swap_id)
    session.expire_all()
    fresh = session.get(ArtworkSwap, swap_id)
    return artwork_response(fresh or row, settings)


@router.get("/v1/app/artwork-swaps/{job_id}", response_model=ArtworkSwapResponse)
def get_artwork_swap(
    job_id: str,
    client: ClientDependency,
    session: SessionDependency,
    settings: SettingsDependency,
) -> ArtworkSwapResponse:
    """API 3. Poll one artwork swap.

    Scoped to the calling device, so one user cannot read another's job by
    guessing an id. Poll until ``poll_after_seconds`` is null; then read
    ``artwork_url`` on success or ``error`` on failure.
    """
    row = session.scalar(
        select(ArtworkSwap).where(
            ArtworkSwap.id == job_id,
            ArtworkSwap.tester_reference == client.tester_reference,
        )
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Artwork swap not found")
    return artwork_response(row, settings)


@router.get("/v1/media/{key:path}")
def synthetic_media_contract(
    key: str,
    settings: SettingsDependency,
    purpose: str,
    expires: int,
    signature: str,
) -> Response:
    if expires <= int(datetime.now(UTC).timestamp()):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Delivery grant expired")
    message = f"{purpose}:{key}:{expires}"
    expected = hmac.new(
        settings.delivery_signing_key.get_secret_value().encode(),
        message.encode(),
        hashlib.sha256,
    ).hexdigest()
    if purpose not in {"preview", "stream", "download"} or not hmac.compare_digest(
        signature, expected
    ):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Delivery grant invalid")
    media_file = resolve_media_file(settings.media_dir, key)
    if media_file is None and key.startswith("orders/"):
        # Personalized render outputs live in the shared renders volume,
        # mounted read-only in the API container.
        media_file = resolve_media_file(settings.render_work_dir, key)
    if media_file is not None:
        disposition = "attachment" if purpose == "download" else "inline"
        return FileResponse(
            media_file,
            headers={"Content-Disposition": f'{disposition}; filename="{media_file.name}"'},
        )
    return Response(status_code=204, headers={"X-StarME-Synthetic-Media": "true"})
