from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import StaticPool

from starme.config import Settings, get_settings


class Base(DeclarativeBase):
    pass


def build_engine(settings: Settings | None = None):  # type: ignore[no-untyped-def]
    active = settings or get_settings()
    connect_args = {"check_same_thread": False} if active.database_url.startswith("sqlite") else {}
    engine_args: dict[str, object] = {
        "pool_pre_ping": True,
        "connect_args": connect_args,
    }
    if active.database_url == "sqlite+pysqlite:///:memory:":
        engine_args["poolclass"] = StaticPool
    return create_engine(active.database_url, **engine_args)


engine = build_engine()
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def get_session() -> Generator[Session, None, None]:
    with SessionLocal() as session:
        yield session
