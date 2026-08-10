from redis import Redis
from rq import Queue

from starme.config import get_settings
from starme.database import SessionLocal
from starme.services import complete_first_look, complete_full_render


def run_first_look(job_id: str) -> None:
    with SessionLocal() as session:
        complete_first_look(session, job_id)


def run_full_render(job_id: str) -> None:
    with SessionLocal() as session:
        complete_full_render(session, job_id)


def enqueue_first_look(job_id: str) -> None:
    settings = get_settings()
    if settings.queue_backend == "inline":
        run_first_look(job_id)
        return
    queue = Queue("starme-first-look", connection=Redis.from_url(settings.redis_url))
    queue.enqueue(run_first_look, job_id, job_id=job_id, job_timeout="10m")


def enqueue_full_render(job_id: str) -> None:
    settings = get_settings()
    if settings.queue_backend == "inline":
        run_full_render(job_id)
        return
    queue = Queue("starme-full-render", connection=Redis.from_url(settings.redis_url))
    queue.enqueue(run_full_render, job_id, job_id=job_id, job_timeout="2h")
