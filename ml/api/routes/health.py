"""Health routes for api."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request, Response, status

from api.model import ModelLoadError, get_model
from api.pipeline import DEFAULT_POSE_SIZE, pose_weight_available

probe_router = APIRouter(tags=["health"])
router = APIRouter(tags=["health"])


def _model_metadata(model: object) -> dict[str, Any] | None:
    metadata_dict = getattr(model, "metadata_dict", None)
    if callable(metadata_dict):
        return metadata_dict()
    metadata = getattr(model, "metadata", None)
    asdict = getattr(metadata, "asdict", None)
    if callable(asdict):
        return asdict()
    return None


def _loaded_model(request: Request) -> object:
    model = getattr(request.app.state, "model", None)
    return model if model is not None else get_model()


@probe_router.get("/health/live")
def live() -> dict[str, str]:
    return {"status": "ok"}


@probe_router.get("/health/ready")
def ready(request: Request, response: Response) -> dict[str, Any]:
    readiness = getattr(request.app.state, "readiness", {"ready": False, "reason": "booting"})
    if not readiness.get("ready", False):
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return readiness


@router.get("/health")
def legacy_health(request: Request) -> dict[str, Any]:
    try:
        model = _loaded_model(request)
        metadata = _model_metadata(model)
        exists = getattr(getattr(model, "model_path", None), "exists", lambda: False)
        artifact_available = bool(exists())
        model_status = "ok"
        model_error = None
    except ModelLoadError as exc:
        metadata = None
        artifact_available = False
        model_status = "error"
        model_error = str(exc)
    return {
        "status": "ok" if model_status == "ok" else "degraded",
        "model": metadata,
        "metadata": metadata,
        "model_type": None if metadata is None else metadata.get("model_type"),
        "model_status": model_status,
        "model_error": model_error,
        "pose": {
            "size": DEFAULT_POSE_SIZE,
            "weight_available": pose_weight_available(DEFAULT_POSE_SIZE),
        },
        "artifacts": {"random_forest_available": artifact_available},
    }
