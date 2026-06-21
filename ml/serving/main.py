"""FastAPI serving app factory."""

from __future__ import annotations

from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI

from serving.lifespan import lifespan as serving_lifespan
from serving.model import get_model
from serving.routes import debug, models, status
from serving.routes import health as health_routes
from serving.routes.debug import PredictRequest, PredictResponse

LifespanFactory = Callable[[FastAPI], AsyncIterator[None]]


def create_app(*, lifespan: LifespanFactory | None = serving_lifespan) -> FastAPI:
    """Create the serving FastAPI app with route modules registered."""
    app = FastAPI(
        title="fall-detector serving",
        version="0.2.0",
        lifespan=lifespan,
    )
    app.include_router(health_routes.router)
    app.include_router(status.router)
    app.include_router(models.router)
    app.include_router(debug.router)
    return app


@asynccontextmanager
async def no_lifespan(app: FastAPI) -> AsyncIterator[None]:
    del app
    yield


def predict(req: PredictRequest, request: Any) -> PredictResponse:
    """Compatibility entrypoint for direct unit tests."""
    debug.get_model = get_model
    return debug._predict(req, request)


def health() -> dict[str, Any]:
    """Compatibility entrypoint for direct unit tests."""
    model = get_model()
    metadata = model.metadata_dict()
    return {
        "status": "ok",
        "model": metadata,
        "metadata": metadata,
        "model_type": metadata.get("model_type"),
        "model_status": "ok",
        "model_error": None,
        "pose": health_routes.legacy_health.__globals__["DEFAULT_POSE_SIZE"],
        "artifacts": {"random_forest_available": model.model_path.exists()},
    }


app = create_app()

__all__ = [
    "PredictRequest",
    "PredictResponse",
    "app",
    "create_app",
    "health",
    "no_lifespan",
    "predict",
]
