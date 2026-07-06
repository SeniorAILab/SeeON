"""FastAPI api app factory."""

from __future__ import annotations

import os
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import APIRouter, FastAPI
from fastapi.staticfiles import StaticFiles

from api.config import get_settings
from api.lifespan import lifespan as serving_lifespan
from api.routes import cameras, ingest_relay, models, status, system
from api.routes import health as health_routes

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
    api_router.include_router(cameras.router)
    api_router.include_router(system.router)
    app.include_router(api_router, prefix=prefix)
    _mount_dashboard_dist(app)
    return app


def _mount_dashboard_dist(app: FastAPI) -> None:
    dashboard_dist = Path(os.environ.get("API_DASHBOARD_DIST", "/app/dashboard"))
    if dashboard_dist.is_dir():
        app.mount("/", StaticFiles(directory=str(dashboard_dist), html=True), name="dashboard")


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
