"""FastAPI api app factory."""

from __future__ import annotations

from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI

from api.config import get_settings
from api.lifespan import lifespan as serving_lifespan
from api.routes import health as health_routes
from api.routes import ingest_relay, models, status

LifespanFactory = Callable[[FastAPI], AsyncIterator[None]]


def create_app(*, lifespan: LifespanFactory | None = serving_lifespan) -> FastAPI:
    """Create the api FastAPI app with route modules registered."""
    settings = get_settings()
    prefix = settings.api_v1_prefix
    app = FastAPI(
        title="fall-detector api",
        version="0.2.0",
        lifespan=lifespan,
    )
    app.include_router(health_routes.probe_router)

    api_router = APIRouter()
    api_router.include_router(health_routes.router)
    api_router.include_router(status.router)
    api_router.include_router(models.router)
    api_router.include_router(ingest_relay.router)
    app.include_router(api_router, prefix=prefix)
    return app


@asynccontextmanager
async def no_lifespan(app: FastAPI) -> AsyncIterator[None]:
    del app
    yield


app = create_app()

__all__ = [
    "app",
    "create_app",
    "no_lifespan",
]
