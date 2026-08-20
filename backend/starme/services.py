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
from starme.models import AuditEvent, EpisodeOutput, FirstLook, Order, RenderJob
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
) -> tuple[SyntheticShell, Path, list[Shot]]:
    """Fail-closed preconditions for the real render provider.

    The face reference must already be a registered private asset:// URI (the
    only route BytePlus accepts for real faces) and the shell must carry its
    content-owner role metadata plus on-disk masters and shot manifest.
    """
    if not order.face_asset_id.startswith("asset://"):
        raise RuntimeError(
            "Order has no registered asset:// face reference; real rendering is blocked"
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
    return shell, media_root, load_shot_manifest(manifest_path)


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
            shell, media_root, manifest = _seedance_order_inputs(order, settings)
            shots = shots_for_episode(manifest, 1, shell.role_character)
            if not shots:
                raise RuntimeError("The manifest has no designated shots in episode 1")
            object_key = f"orders/{order.id}/first_look.jpg"
            work_root = Path(settings.render_work_dir)
            render_first_look(
                master=media_root / "shells" / shell.id / "episode-1.mp4",
                shot=shots[0],
                work_dir=work_root / "orders" / order.id / "work",
                destination=work_root / object_key,
                face_asset_uri=order.face_asset_id,
                subject_video_desc=shell.role_video_desc,
                reference=f"{order.id}-first-look",
                settings=settings,
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
            shell, media_root, manifest = _seedance_order_inputs(order, settings)
            work_root = Path(settings.render_work_dir)
            for number in range(1, shell.episode_count + 1):
                shots = shots_for_episode(manifest, number, shell.role_character)
                object_key = f"orders/{order.id}/episode-{number}.mp4"
                destination = work_root / object_key
                assemble_episode(
                    master=media_root / "shells" / shell.id / f"episode-{number}.mp4",
                    shots=shots,
                    work_dir=work_root / "orders" / order.id / "work" / f"ep{number}",
                    destination=destination,
                    face_asset_uri=order.face_asset_id,
                    subject_video_desc=shell.role_video_desc,
                    reference_prefix=f"{order.id}-ep{number}",
                    settings=settings,
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
