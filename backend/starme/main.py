import logging

from fastapi import FastAPI

from starme import __version__
from starme.api import router
from starme.config import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    logging.basicConfig(level=settings.log_level)
    app = FastAPI(
        title="StarME Private Prototype API",
        version=__version__,
        description=(
            "Provider-neutral internal foundation. Sensitive processing is disabled by default."
        ),
        docs_url="/docs" if settings.environment in {"local", "test"} else None,
        redoc_url=None,
    )
    app.include_router(router)
    return app


app = create_app()
