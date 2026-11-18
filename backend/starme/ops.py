"""Ops CMS for the backend team: entries, video QC, artwork feed, pipeline.

Two locks. Every route answers only to the office network / VPN, judged by
the X-Real-IP nginx sets from $remote_addr (anything else gets a 404, so the
CMS is invisible from the internet). Inside that, every /ops/api route but
login needs a signed-in team member (ops_auth).
"""

import ipaddress
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from statistics import median
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from starme.artwork import FAILED, QUEUED, RUNNING, SUCCEEDED
from starme.catalogue import SYNTHETIC_SHELLS
from starme.config import Settings, get_settings
from starme.database import get_session
from starme.delivery import signed_url
from starme.higgsfield import sheet_folder
from starme.jobs import enqueue_full_render
from starme.models import (
    AppSelfie,
    ArtworkSwap,
    AuditEvent,
    ConsentRecord,
    OpsUser,
    Order,
    RenderJob,
)
from starme.ops_auth import current_user, require
from starme.ops_auth import router as auth_router
from starme.schemas import JobState, OrderState
from starme.services import _reference_portrait, audit

PAGE = Path(__file__).with_name("ops.html")
IN_PIPELINE = [
    OrderState.QUEUED,
    OrderState.FIRST_LOOK_RENDERING,
    OrderState.AWAITING_FIRST_LOOK,
    OrderState.FULL_RENDERING,
]
QUEUES = ["starme-first-look", "starme-full-render", "starme-seedance", "starme-artwork-swap"]
STUCK_AFTER = timedelta(minutes=30)


def ops_guard(request: Request, settings: Annotated[Settings, Depends(get_settings)]) -> str:
    """The caller's IP when it is on an allowed network, else 404."""
    ip = request.headers.get("x-real-ip") or (request.client.host if request.client else "")
    try:
        addr = ipaddress.ip_address(ip.strip())
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND) from None
    nets = [n.strip() for n in settings.ops_allowed_networks.split(",") if n.strip()]
    if not any(addr in ipaddress.ip_network(n, strict=False) for n in nets):
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    return ip


router = APIRouter(prefix="/ops", dependencies=[Depends(ops_guard)], include_in_schema=False)
# Everything with data needs a signed-in member; the page itself and login do not.
api = APIRouter(dependencies=[Depends(current_user)])
SessionDep = Annotated[Session, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
ReviewerDep = Annotated[OpsUser, require("admin", "reviewer")]


def _tally(session: Session, stmt: Any) -> dict[str, int]:
    return {str(key): int(n) for key, n in session.execute(stmt).all()}


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return (value if value.tzinfo else value.replace(tzinfo=UTC)).isoformat()


def _seconds(start: datetime | None, end: datetime | None) -> float | None:
    if start is None or end is None:
        return None
    return (end.replace(tzinfo=None) - start.replace(tzinfo=None)).total_seconds()


def _latest_selfies(session: Session, refs: set[str]) -> dict[str, str]:
    """tester_reference -> newest selfie URL, so video rows get a face too."""
    if not refs:
        return {}
    rows = session.execute(
        select(AppSelfie.tester_reference, AppSelfie.public_url)
        .where(AppSelfie.tester_reference.in_(refs), AppSelfie.deleted_at.is_(None))
        .order_by(AppSelfie.created_at)
    ).all()
    return {ref: url for ref, url in rows}


def _video_row(order: Order, selfies: dict[str, str]) -> dict[str, object]:
    return {
        "kind": "video",
        "id": order.id,
        "name": order.consent.typed_name if order.consent else order.tester_reference,
        "user": order.tester_reference,
        "image": selfies.get(order.tester_reference),
        "title": order.shell_id,
        "detail": order.package_id,
        "status": order.status,
        "created_at": _iso(order.created_at),
        "updated_at": _iso(order.updated_at),
    }


def _artwork_row(row: ArtworkSwap) -> dict[str, object]:
    return {
        "kind": "artwork",
        "id": row.id,
        "name": row.selfie.display_name if row.selfie else row.tester_reference,
        "user": row.tester_reference,
        "image": row.source_image_url,
        "result": row.result_url,
        "title": row.shell_id,
        "detail": row.failure_reason,
        "status": row.status,
        "created_at": _iso(row.created_at),
        "updated_at": _iso(row.updated_at),
        "seconds": _seconds(row.created_at, row.completed_at),
    }


@router.get("")
def page() -> FileResponse:
    return FileResponse(PAGE, headers={"Cache-Control": "no-store"})


@api.get("/api/overview")
def overview(session: SessionDep, days: int = Query(1, ge=1, le=90)) -> dict[str, object]:
    since = datetime.now(UTC) - timedelta(days=days)

    def count(model: type, *where: Any) -> int:
        return session.scalar(select(func.count()).select_from(model).where(*where)) or 0

    orders_by_status = _tally(
        session,
        select(Order.status, func.count()).where(Order.created_at >= since).group_by(Order.status),
    )
    swaps_by_status = _tally(
        session,
        select(ArtworkSwap.status, func.count())
        .where(ArtworkSwap.created_at >= since)
        .group_by(ArtworkSwap.status),
    )
    done = session.execute(
        select(ArtworkSwap.created_at, ArtworkSwap.completed_at).where(
            ArtworkSwap.status == SUCCEEDED, ArtworkSwap.completed_at >= since
        )
    ).all()
    times = sorted(t for t in (_seconds(a, b) for a, b in done) if t is not None)
    created = [
        *session.scalars(select(Order.created_at).where(Order.created_at >= since)),
        *session.scalars(select(ArtworkSwap.created_at).where(ArtworkSwap.created_at >= since)),
    ]
    # ponytail: buckets built in Python; move to SQL date_trunc past ~100k rows a day.
    buckets = 24 if days == 1 else days
    width = timedelta(days=days) / buckets
    series = [0] * buckets
    for at in created:
        at = at if at.tzinfo else at.replace(tzinfo=UTC)
        series[min(buckets - 1, int((at - since) / width))] += 1
    events = session.scalars(select(AuditEvent).order_by(AuditEvent.occurred_at.desc()).limit(15))
    return {
        "days": days,
        "selfies": count(AppSelfie, AppSelfie.created_at >= since),
        "videos": sum(orders_by_status.values()),
        "artworks": sum(swaps_by_status.values()),
        "video_by_status": orders_by_status,
        "artwork_by_status": swaps_by_status,
        "awaiting_qc": count(Order, Order.status == OrderState.AWAITING_QC),
        "videos_in_pipeline": count(Order, Order.status.in_(IN_PIPELINE)),
        "artwork_median_s": median(times) if times else None,
        "artwork_p95_s": times[int(len(times) * 0.95) - 1] if len(times) >= 20 else None,
        "series": series,
        "activity": [
            {
                "at": _iso(e.occurred_at),
                "type": e.event_type,
                "subject": e.subject_type,
                "ref": e.subject_reference,
            }
            for e in events
        ],
    }


@api.get("/api/entries")
def entries(
    session: SessionDep,
    kind: Literal["all", "video", "artwork"] = "all",
    state: str | None = Query(None, alias="status"),
    q: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> dict[str, object]:
    like = f"%{q.strip()}%" if q and q.strip() else None
    order_q = select(Order).join(Order.consent).options(selectinload(Order.consent))
    swap_q = (
        select(ArtworkSwap).outerjoin(ArtworkSwap.selfie).options(selectinload(ArtworkSwap.selfie))
    )
    if state:
        order_q = order_q.where(Order.status == state)
        swap_q = swap_q.where(ArtworkSwap.status == state)
    if like:
        order_q = order_q.where(
            or_(
                ConsentRecord.typed_name.ilike(like),
                Order.id.ilike(like),
                Order.tester_reference.ilike(like),
            )
        )
        swap_q = swap_q.where(
            or_(
                AppSelfie.display_name.ilike(like),
                ArtworkSwap.id.ilike(like),
                ArtworkSwap.tester_reference.ilike(like),
            )
        )
    total = 0
    rows: list[dict[str, object]] = []
    # Newest first across both kinds: the top offset+limit of each, merged.
    if kind in ("all", "video"):
        total += session.scalar(select(func.count()).select_from(order_q.subquery())) or 0
        orders = session.scalars(
            order_q.order_by(Order.created_at.desc()).limit(offset + limit)
        ).all()
        selfies = _latest_selfies(session, {o.tester_reference for o in orders})
        rows += [_video_row(o, selfies) for o in orders]
    if kind in ("all", "artwork"):
        total += session.scalar(select(func.count()).select_from(swap_q.subquery())) or 0
        swaps = session.scalars(
            swap_q.order_by(ArtworkSwap.created_at.desc()).limit(offset + limit)
        ).all()
        rows += [_artwork_row(s) for s in swaps]
    rows.sort(key=lambda r: str(r["created_at"]), reverse=True)
    return {"total": total, "rows": rows[offset : offset + limit]}


def _order(session: Session, order_id: str) -> Order:
    order = session.scalar(
        select(Order)
        .where(Order.id == order_id)
        .options(
            selectinload(Order.consent),
            selectinload(Order.jobs),
            selectinload(Order.episodes),
            selectinload(Order.first_look),
        )
    )
    if order is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    return order


def _audit_trail(session: Session, ref: str) -> list[dict[str, object]]:
    events = session.scalars(
        select(AuditEvent)
        .where(AuditEvent.subject_reference == ref)
        .order_by(AuditEvent.occurred_at.desc())
    )
    return [
        {
            "at": _iso(e.occurred_at),
            "type": e.event_type,
            "by": e.actor_reference,
            "payload": json.loads(e.payload_json or "{}"),
        }
        for e in events
    ]


def _episodes(order: Order, settings: Settings) -> list[dict[str, object]]:
    """Signed links for the CMS player. Keys under orders/ are this user's own
    render; anything else (shells/...) is a stock show file served to everyone,
    which is what the August test orders got."""
    ttl = settings.signed_url_ttl_seconds
    return [
        {
            "number": e.episode_number,
            "url": signed_url(e.object_key, "stream", ttl, settings),
            "personalised": e.object_key.startswith("orders/"),
        }
        for e in sorted(order.episodes, key=lambda e: e.episode_number)
    ]


QC_EVENTS = {
    "order.qc_approved": "approved",
    "order.qc_redo": "redo",
    "order.qc_rejected": "rejected",
}


@api.get("/api/qc")
def qc(session: SessionDep, settings: SettingsDep) -> dict[str, list[dict[str, object]]]:
    """Waiting videos plus QC history, grouped by outcome. READY videos with no
    QC decision were released before the gate existed (18/11/2026)."""
    decisions: dict[str, AuditEvent] = {}
    for event in session.scalars(
        select(AuditEvent)
        .where(AuditEvent.event_type.in_(QC_EVENTS))
        .order_by(AuditEvent.occurred_at)
    ):
        decisions[event.subject_reference] = event  # latest wins
    orders = session.scalars(
        select(Order)
        .where(
            or_(
                Order.status.in_([OrderState.AWAITING_QC, OrderState.READY]),
                Order.id.in_(decisions),
            )
        )
        .options(selectinload(Order.consent), selectinload(Order.episodes))
        .order_by(Order.updated_at.desc())
    ).all()
    selfies = _latest_selfies(session, {o.tester_reference for o in orders})
    groups: dict[str, list[dict[str, object]]] = {
        k: [] for k in ["waiting", "approved", "redo", "rejected", "before_qc"]
    }
    for order in orders:
        last = decisions.get(order.id)
        if order.status == OrderState.AWAITING_QC:
            group = "waiting"  # a redo that came back waits again
        elif last is not None:
            group = QC_EVENTS[last.event_type]
        else:
            group = "before_qc"
        groups[group].append(
            {
                **_video_row(order, selfies),
                "decided_by": last.actor_reference if last and group != "waiting" else None,
                "decided_at": _iso(last.occurred_at) if last and group != "waiting" else None,
                "note": json.loads(last.payload_json or "{}").get("note") if last else None,
                "episodes": _episodes(order, settings),
            }
        )
    groups["waiting"].reverse()  # oldest first: that is the order to review in
    return groups


def _render_images(order: Order, settings: Settings) -> dict[str, Path]:
    """The portrait the render used and, once made, its character sheet."""
    portrait = _reference_portrait(order, settings)
    if portrait is None:
        return {}
    out = {"portrait": portrait}
    shell = next((s for s in SYNTHETIC_SHELLS if s.id == order.shell_id), None)
    folder = sheet_folder(portrait.read_bytes(), shell.role_video_desc if shell else "", settings)
    for name in ("sheet", "closeup"):
        if (folder / f"{name}.png").is_file():
            out[name] = folder / f"{name}.png"
    return out


@api.get("/api/video/{order_id}/image/{name}")
def render_image(
    order_id: str,
    name: Literal["portrait", "sheet", "closeup"],
    session: SessionDep,
    settings: SettingsDep,
) -> FileResponse:
    path = _render_images(_order(session, order_id), settings).get(name)
    if path is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not made yet")
    return FileResponse(path, media_type="image/png", headers={"Cache-Control": "no-store"})


@api.get("/api/video/{order_id}")
def video(order_id: str, session: SessionDep, settings: SettingsDep) -> dict[str, object]:
    order = _order(session, order_id)
    ttl = settings.signed_url_ttl_seconds
    row = _video_row(order, _latest_selfies(session, {order.tester_reference}))
    return {
        **row,
        "render_images": sorted(_render_images(order, settings)),
        "role": order.role_id,
        "consent": {
            "version": order.consent.consent_version,
            "accepted_at": _iso(order.consent.accepted_at),
            "revoked_at": _iso(order.consent.revoked_at),
        },
        "first_look": None
        if order.first_look is None
        else {
            "status": order.first_look.status,
            "url": signed_url(order.first_look.object_key, "preview", ttl, settings),
        },
        "episodes": [
            {"number": e.episode_number, "url": signed_url(e.object_key, "stream", ttl, settings)}
            for e in sorted(order.episodes, key=lambda e: e.episode_number)
        ],
        "jobs": [
            {
                "id": j.id,
                "kind": j.kind,
                "status": j.status,
                "attempts": j.attempt_count,
                "failure": j.failure_reason,
                "created_at": _iso(j.created_at),
                "started_at": _iso(j.started_at),
                "completed_at": _iso(j.completed_at),
                "seconds": _seconds(j.started_at, j.completed_at),
            }
            for j in sorted(order.jobs, key=lambda j: j.created_at)
        ],
        "audit": _audit_trail(session, order.id),
    }


@api.get("/api/artwork/{swap_id}")
def artwork(swap_id: str, session: SessionDep) -> dict[str, object]:
    row = session.scalar(
        select(ArtworkSwap)
        .where(ArtworkSwap.id == swap_id)
        .options(selectinload(ArtworkSwap.selfie))
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Artwork not found")
    return {
        **_artwork_row(row),
        "attempts": row.attempt_count,
        "template": row.artwork_url,
        "landscape": row.landscape_url,
        "character": row.character_url,
        "audit": _audit_trail(session, row.id),
    }


class QcDecision(BaseModel):
    decision: Literal["approve", "reject", "redo"]
    note: str = Field(default="", max_length=2000)


@api.post("/api/video/{order_id}/qc")
def decide(
    order_id: str, body: QcDecision, session: SessionDep, settings: SettingsDep, user: ReviewerDep
) -> dict[str, object]:
    order = _order(session, order_id)
    if order.status != OrderState.AWAITING_QC:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Order is {order.status}, not awaiting QC")
    who = user.email
    payload: dict[str, object] | None = {"note": body.note} if body.note else None
    if body.decision == "approve":
        order.status = OrderState.READY
        audit(session, "order.qc_approved", who, "order", order.id, payload)
        audit(session, "order.ready", who, "order", order.id)
    elif body.decision == "reject":
        order.status = OrderState.FAILED
        audit(session, "order.qc_rejected", who, "order", order.id, payload)
    else:
        for episode in list(order.episodes):
            session.delete(episode)
        job = RenderJob(order_id=order.id, kind="FULL_RENDER", status=JobState.QUEUED, priority=5)
        session.add(job)
        order.status = OrderState.FULL_RENDERING
        audit(session, "order.qc_redo", who, "order", order.id, payload)
    session.commit()
    if body.decision == "redo":
        enqueue_full_render(job.id)
    session.expire_all()
    return video(order_id, session, settings)


class Takedown(BaseModel):
    note: str = Field(default="", max_length=2000)


@api.post("/api/artwork/{swap_id}/takedown")
def takedown(
    swap_id: str, body: Takedown, session: SessionDep, user: ReviewerDep
) -> dict[str, object]:
    row = session.get(ArtworkSwap, swap_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Artwork not found")
    if row.status != SUCCEEDED:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Artwork is {row.status}, not released")
    # FAILED is a state the App already handles; the reason says why.
    row.status = FAILED
    row.failure_reason = f"Taken down in QC. {body.note}".strip()
    audit(
        session,
        "artwork.taken_down",
        user.email,
        "artwork",
        row.id,
        {"note": body.note} if body.note else None,
    )
    session.commit()
    return artwork(swap_id, session)


def _queue_depths(settings: Settings) -> dict[str, int] | None:
    if settings.queue_backend != "rq":
        return None
    try:
        from redis import Redis
        from rq import Queue

        redis = Redis.from_url(settings.redis_url, socket_timeout=2)
        return {name: len(Queue(name, connection=redis)) for name in QUEUES}
    except Exception:  # noqa: BLE001 - the page shows "unknown", never a 500
        return None


@api.get("/api/pipeline")
def pipeline(session: SessionDep, settings: SettingsDep) -> dict[str, object]:
    now = datetime.now(UTC)
    day = now - timedelta(days=1)
    jobs = session.execute(
        select(RenderJob.kind, RenderJob.status, func.count())
        .where(RenderJob.status.in_([JobState.QUEUED, JobState.RUNNING]))
        .group_by(RenderJob.kind, RenderJob.status)
    ).all()
    stuck = session.scalars(
        select(RenderJob)
        .where(RenderJob.status == JobState.RUNNING, RenderJob.started_at < now - STUCK_AFTER)
        .order_by(RenderJob.started_at)
    ).all()
    failed_jobs = session.scalars(
        select(RenderJob)
        .where(RenderJob.status == JobState.FAILED, RenderJob.created_at >= day)
        .order_by(RenderJob.created_at.desc())
        .limit(25)
    ).all()
    failed_swaps = session.scalars(
        select(ArtworkSwap)
        .where(ArtworkSwap.status == FAILED, ArtworkSwap.updated_at >= day)
        .order_by(ArtworkSwap.updated_at.desc())
        .limit(25)
    ).all()
    swaps_active = _tally(
        session,
        select(ArtworkSwap.status, func.count())
        .where(ArtworkSwap.status.in_([QUEUED, RUNNING]))
        .group_by(ArtworkSwap.status),
    )
    orders_now = _tally(
        session,
        select(Order.status, func.count())
        .where(Order.status.in_([*IN_PIPELINE, OrderState.AWAITING_QC]))
        .group_by(Order.status),
    )
    errors = [
        {
            "at": _iso(j.created_at),
            "kind": "video",
            "id": j.order_id,
            "step": j.kind,
            "error": j.failure_reason,
            "tries": j.attempt_count,
        }
        for j in failed_jobs
    ] + [
        {
            "at": _iso(s.updated_at),
            "kind": "artwork",
            "id": s.id,
            "step": "ARTWORK",
            "error": s.failure_reason,
            "tries": s.attempt_count,
        }
        for s in failed_swaps
    ]
    errors.sort(key=lambda e: str(e["at"]), reverse=True)
    return {
        "provider": settings.render_provider,
        "qc_gate": settings.video_qc_gate,
        "orders_now": orders_now,
        "artwork_now": swaps_active,
        "jobs": [{"kind": k, "status": s, "count": c} for k, s, c in jobs],
        "queues": _queue_depths(settings),
        "stuck": [{"id": j.order_id, "step": j.kind, "since": _iso(j.started_at)} for j in stuck],
        "errors": errors[:30],
    }


router.include_router(auth_router)
router.include_router(api)
