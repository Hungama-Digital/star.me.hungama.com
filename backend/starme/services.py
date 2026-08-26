import hashlib
import json
import secrets
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from starme.catalogue import SYNTHETIC_SHELLS
from starme.config import Settings, get_settings
from starme.episode_assembly import (
    Shot,
    assemble_episode,
    load_shot_manifest,
    render_first_look,
    shots_for_episode,
)
from starme.face_qa import reference_embedding
from starme.linode_storage import LinodeObjectStorage
from starme.models import AuditEvent, EpisodeOutput, FirstLook, Order, RenderJob
from starme.render_pipeline import _asset_client
from starme.schemas import JobState, OrderState, SyntheticShell


def audit(
    session: Session,
    event_type: str,
    actor_reference: str,
    subject_type: str,
    subject_reference: str,
    payload: dict[str, object] | None = None,
) -> None:
    session.add(
        AuditEvent(
            event_type=event_type,
            actor_type="tester",
            actor_reference=actor_reference,
            subject_type=subject_type,
            subject_reference=subject_reference,
            correlation_id=secrets.token_hex(12),
            payload_json=json.dumps(payload or {}, sort_keys=True),
        )
    )


def first_look_key(order: Order) -> str:
    """Passthrough demo delivery maps first look to a fixed shell frame when a media
    dir is configured; otherwise it stays a per-order synthetic key."""
    if get_settings().media_dir:
        return f"shells/{order.shell_id}/first_look.jpg"
    return f"synthetic/first-looks/{order.id}.jpg"


def episode_key(order: Order, number: int) -> str:
    if get_settings().media_dir:
        return f"shells/{order.shell_id}/episode-{number}.mp4"
    return f"synthetic/orders/{order.id}/episode-{number}.mp4"


def _seedance_order_inputs(
    order: Order, settings: Settings
) -> tuple[SyntheticShell, Path, list[Shot], str]:
    """Fail-closed preconditions for the real render provider.

    The face reference must be a registered private asset:// URI (the only
    route BytePlus accepts for real faces) - either on the order itself or via
    the operator-maintained tester mapping - and the shell must carry its
    content-owner role metadata plus on-disk masters and shot manifest.
    """
    if not settings.allow_sensitive_processing:
        raise RuntimeError(
            "STARME_ALLOW_SENSITIVE_PROCESSING must be enabled before real face rendering"
        )
    face_uri = order.face_asset_id
    if not face_uri.startswith("asset://"):
        face_uri = settings.tester_face_assets.get(order.tester_reference, "")
    if not face_uri.startswith("asset://"):
        raise RuntimeError(
            "No registered asset:// face reference for this order or tester; "
            "real rendering is blocked"
        )
    if not settings.media_dir:
        raise RuntimeError("STARME_MEDIA_DIR is required for the seedance render provider")
    shell = next((item for item in SYNTHETIC_SHELLS if item.id == order.shell_id), None)
    if shell is None or not shell.role_character or not shell.role_video_desc:
        raise RuntimeError("Shell is missing content-owner role metadata for rendering")
    media_root = Path(settings.media_dir)
    manifest_path = media_root / "shells" / shell.id / "shot-manifest.json"
    if not manifest_path.is_file():
        raise RuntimeError(f"Shot manifest is missing: shells/{shell.id}/shot-manifest.json")
    return shell, media_root, load_shot_manifest(manifest_path), face_uri


def _reference_portrait(order: Order, settings: Settings) -> Path | None:
    """The subscriber's reference portrait for face QA, stored by the operator
    at media_dir/faces/{tester_reference}.(png|jpg|jpeg)."""
    roots = [Path(settings.faces_dir)] if settings.faces_dir else []
    if settings.media_dir:
        roots.append(Path(settings.media_dir) / "faces")
    for root in roots:
        for suffix in ("png", "jpg", "jpeg"):
            candidate = root / f"{order.tester_reference}.{suffix}"
            if candidate.is_file():
                return candidate
    return None


#: Largest portrait the App may register. Comfortably above a phone camera
#: original, low enough that a mis-picked video file is refused rather than
#: streamed into memory.
MAX_PORTRAIT_BYTES = 15 * 1024 * 1024


def _normalized_portrait(raw: bytes, destination: Path) -> Path:
    """Bake EXIF rotation into the pixels and re-encode as PNG.

    Learned the hard way on 25 August: the tester's photo arrived as a
    4032x3024 landscape carrying EXIF orientation 5, so every consumer that
    ignores the tag saw a face lying on its side. Phone galleries are full of
    these, and a gallery upload is exactly what this endpoint receives.
    ``cv2.imread`` applies the tag and writing it back out drops it, so what
    downstream sees is upright with nothing left to misread.
    """
    import cv2  # type: ignore[import-not-found]

    destination.parent.mkdir(parents=True, exist_ok=True)
    scratch = destination.with_suffix(".upload")
    scratch.write_bytes(raw)
    try:
        image = cv2.imread(str(scratch))  # honours EXIF orientation
        if image is None:
            raise ValueError("That file is not an image we can read.")
        cv2.imwrite(str(destination), image)
    finally:
        scratch.unlink(missing_ok=True)
    return destination


def register_face_asset(
    *, raw: bytes, tester_reference: str, settings: Settings
) -> str:
    """Host a portrait, register it with the provider, and keep a QA copy.

    The whole App-side identity path in one call: normalize, prove there is a
    face to swap, publish where the provider can fetch it, register it as an
    asset, and store the same pixels for the face-QA gate to compare renders
    against. Returns the ``asset://`` URI the order will carry.
    """
    if len(raw) > MAX_PORTRAIT_BYTES:
        raise ValueError("That photo is too large. Please choose one under 15 MB.")
    storage = LinodeObjectStorage.from_settings(settings)
    if storage is None:
        raise RuntimeError("Object storage is not configured, so a face cannot be registered")
    if not settings.byteplus_asset_group_id:
        raise RuntimeError("No provider asset group is configured")

    # Staged, not written straight to the live path. A second attempt that
    # fails must not destroy the portrait already working for this device -
    # found the hard way, by refusing a faceless photo under a reference that
    # already had a good one and taking the good one down with it. The QA gate
    # reads this file at render time, so losing it silently breaks the render.
    portrait = Path(settings.faces_dir) / f"{tester_reference}.png"
    staged = portrait.with_name(f"{tester_reference}.incoming.png")
    _normalized_portrait(raw, staged)
    try:
        # Fail here rather than three minutes into a paid render: the QA gate
        # needs an embedding of this face, and a portrait it cannot read is a
        # render that cannot be verified.
        if settings.face_qa_enabled:
            try:
                reference_embedding(staged)
            except ValueError as exc:
                raise ValueError(
                    "We could not find a clear face in that photo. Use a front-facing "
                    "close-up in even light."
                ) from exc

        stored = storage.put(
            storage.object_key(f"faces/{tester_reference}.png"),
            staged.read_bytes(),
            "image/png",
        )
    except BaseException:
        staged.unlink(missing_ok=True)
        raise
    try:
        asset = _asset_client(settings).ensure_active_asset(
            group_id=settings.byteplus_asset_group_id,
            source_url=storage.public_url(stored.key),
            asset_type="Image",
            name=f"starme-face-{tester_reference}",
        )
    except BaseException:
        staged.unlink(missing_ok=True)
        raise
    # Promoted only once the provider has the face: until this line the device's
    # previous portrait is still the one on disk.
    staged.replace(portrait)
    return asset.uri


def _lead_portrait(shell: SyntheticShell, media_root: Path) -> Path | None:
    """The still of the ORIGINAL lead, beside the shell's own media.

    Content-owner material, named by the catalogue rather than discovered, and
    optional: a shell that has not supplied one still renders, with the weaker
    subscriber-only QA and a note to that effect in the report.
    """
    if not shell.role_original_portrait:
        return None
    candidate = media_root / "shells" / shell.id / shell.role_original_portrait
    return candidate if candidate.is_file() else None


def _fail_job(session: Session, job: RenderJob, order: Order, reason: str) -> None:
    job.status = JobState.FAILED
    job.completed_at = datetime.now(UTC)
    job.failure_reason = reason[:500]
    order.status = OrderState.FAILED
    audit(
        session,
        "render.failed",
        order.tester_reference,
        "order",
        order.id,
        {"job": job.id, "reason": reason[:200]},
    )
    session.commit()


def complete_first_look(session: Session, job_id: str) -> None:
    job = session.get(RenderJob, job_id)
    if job is None or job.status == JobState.CANCELED:
        return
    settings = get_settings()
    now = datetime.now(UTC)
    job.status = JobState.RUNNING
    job.started_at = now
    job.attempt_count += 1
    order = job.order
    order.status = OrderState.FIRST_LOOK_RENDERING
    session.flush()
    if settings.render_provider == "seedance":
        try:
            shell, media_root, manifest, face_uri = _seedance_order_inputs(order, settings)
            shots = shots_for_episode(manifest, 1, shell.role_character)
            if not shots:
                raise RuntimeError("The manifest has no designated shots in episode 1")
            object_key = f"orders/{order.id}/first_look.jpg"
            work_root = Path(settings.render_work_dir)
            render_first_look(
                master=media_root / "shells" / shell.id / "episode-1.mp4",
                shots=shots,
                work_dir=work_root / "orders" / order.id / "work",
                destination=work_root / object_key,
                face_asset_uri=face_uri,
                subject_video_desc=shell.role_video_desc,
                extra_notes=shell.role_render_notes,
                reference=f"{order.id}-first-look",
                settings=settings,
                reference_portrait=_reference_portrait(order, settings),
                lead_portrait=_lead_portrait(shell, media_root),
            )
        except Exception as exc:  # noqa: BLE001 - report honestly, never fake readiness
            _fail_job(session, job, order, str(exc))
            return
    else:
        object_key = first_look_key(order)
    session.add(FirstLook(order_id=order.id, object_key=object_key, status="PENDING"))
    job.status = JobState.COMPLETE
    job.completed_at = datetime.now(UTC)
    order.status = OrderState.AWAITING_FIRST_LOOK
    audit(session, "first_look.ready", order.tester_reference, "order", order.id)
    session.commit()


def complete_full_render(session: Session, job_id: str) -> None:
    job = session.get(RenderJob, job_id)
    if job is None or job.status == JobState.CANCELED:
        return
    settings = get_settings()
    now = datetime.now(UTC)
    job.status = JobState.RUNNING
    job.started_at = now
    job.attempt_count += 1
    order = job.order
    order.status = OrderState.FULL_RENDERING
    session.flush()
    if settings.render_provider == "seedance":
        try:
            shell, media_root, manifest, face_uri = _seedance_order_inputs(order, settings)
            work_root = Path(settings.render_work_dir)
            episode_count = shell.episode_count
            if settings.render_episode_limit:
                episode_count = min(episode_count, settings.render_episode_limit)
            # Re-renders replace any earlier outputs for this order.
            for stale in list(order.episodes):
                session.delete(stale)
            session.flush()
            for number in range(1, episode_count + 1):
                shots = shots_for_episode(manifest, number, shell.role_character)
                object_key = f"orders/{order.id}/episode-{number}.mp4"
                destination = work_root / object_key
                assemble_episode(
                    master=media_root / "shells" / shell.id / f"episode-{number}.mp4",
                    shots=shots,
                    work_dir=work_root / "orders" / order.id / "work" / f"ep{number}",
                    destination=destination,
                    face_asset_uri=face_uri,
                    subject_video_desc=shell.role_video_desc,
                    extra_notes=shell.role_render_notes,
                    reference_prefix=f"{order.id}-ep{number}",
                    settings=settings,
                    reference_portrait=_reference_portrait(order, settings),
                lead_portrait=_lead_portrait(shell, media_root),
                )
                session.add(
                    EpisodeOutput(
                        order_id=order.id,
                        episode_number=number,
                        object_key=object_key,
                        checksum_sha256=hashlib.sha256(destination.read_bytes()).hexdigest(),
                    )
                )
        except Exception as exc:  # noqa: BLE001 - report honestly, never fake readiness
            _fail_job(session, job, order, str(exc))
            return
    else:
        for number in range(1, 4):
            key = episode_key(order, number)
            session.add(
                EpisodeOutput(
                    order_id=order.id,
                    episode_number=number,
                    object_key=key,
                    checksum_sha256=hashlib.sha256(key.encode()).hexdigest(),
                )
            )
    job.status = JobState.COMPLETE
    job.completed_at = datetime.now(UTC)
    order.status = OrderState.READY
    audit(session, "order.ready", order.tester_reference, "order", order.id)
    session.commit()


def cancel_active_jobs(session: Session, order: Order) -> int:
    jobs = session.scalars(
        select(RenderJob).where(
            RenderJob.order_id == order.id,
            RenderJob.status.in_([JobState.QUEUED, JobState.RUNNING]),
        )
    ).all()
    settings = get_settings()
    for job in jobs:
        cancellation_errors: list[str] = []
        if settings.queue_backend == "rq" and job.status == JobState.QUEUED:
            try:
                from redis import Redis
                from rq import cancel_job

                cancel_job(job.id, connection=Redis.from_url(settings.redis_url))
            except Exception:  # noqa: BLE001 - revocation must still complete and fail closed
                cancellation_errors.append("RQ cancellation could not be confirmed")
        if (
            settings.render_provider in {"cineiq", "seedance"}
            and job.provider_reference
            and job.status == JobState.RUNNING
        ):
            try:
                from starme.render_pipeline import cancel_seedance_task

                cancel_seedance_task(job.provider_reference, settings)
            except Exception:  # noqa: BLE001 - record failure without blocking consent revocation
                cancellation_errors.append("Provider cancellation could not be confirmed")
        job.status = JobState.CANCELED
        job.completed_at = datetime.now(UTC)
        if cancellation_errors:
            job.failure_reason = "; ".join(cancellation_errors)
    return len(jobs)
