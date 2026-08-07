import hashlib
import json
import secrets
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from starme.config import get_settings
from starme.models import AuditEvent, EpisodeOutput, FirstLook, Order, RenderJob
from starme.schemas import JobState, OrderState


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


def complete_first_look(session: Session, job_id: str) -> None:
    job = session.get(RenderJob, job_id)
    if job is None or job.status == JobState.CANCELED:
        return
    now = datetime.now(UTC)
    job.status = JobState.RUNNING
    job.started_at = now
    job.attempt_count += 1
    order = job.order
    order.status = OrderState.FIRST_LOOK_RENDERING
    session.flush()
    session.add(
        FirstLook(
            order_id=order.id,
            object_key=first_look_key(order),
            status="PENDING",
        )
    )
    job.status = JobState.COMPLETE
    job.completed_at = now
    order.status = OrderState.AWAITING_FIRST_LOOK
    audit(session, "first_look.ready", order.tester_reference, "order", order.id)
    session.commit()


def complete_full_render(session: Session, job_id: str) -> None:
    job = session.get(RenderJob, job_id)
    if job is None or job.status == JobState.CANCELED:
        return
    now = datetime.now(UTC)
    job.status = JobState.RUNNING
    job.started_at = now
    job.attempt_count += 1
    order = job.order
    order.status = OrderState.FULL_RENDERING
    session.flush()
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
    job.completed_at = now
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
    for job in jobs:
        job.status = JobState.CANCELED
        job.completed_at = datetime.now(UTC)
    return len(jobs)
