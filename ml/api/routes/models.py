"""Model registry route."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request

from runners.registry import DEFAULT_REGISTRY

router = APIRouter(tags=["models"])


def _model_metadata(model: object | None) -> dict[str, Any] | None:
    if model is None:
        return None
    metadata_dict = getattr(model, "metadata_dict", None)
    if callable(metadata_dict):
        return metadata_dict()
    metadata = getattr(model, "metadata", None)
    asdict = getattr(metadata, "asdict", None)
    if callable(asdict):
        return asdict()
    return {
        "name": getattr(model, "name", None),
        "version": getattr(model, "version", None),
    }


@router.get("/models")
def models(request: Request) -> dict[str, object]:
    registry = getattr(request.app.state, "model_registry", DEFAULT_REGISTRY)
    model = getattr(request.app.state, "model", None)
    return {
        "registry": {"tasks": list(registry.tasks())},
        "loaded_model": _model_metadata(model),
        "device": getattr(request.app.state, "device", None),
    }
