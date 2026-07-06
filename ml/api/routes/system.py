"""System status route."""

from __future__ import annotations

import os

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict

from api.backend_mapping import backend_status_from_env

router = APIRouter(tags=["system"])


class BackendStatusResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    configured: bool
    reachable: bool | None
    last_ok_at: str | None


class SystemResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    backend: BackendStatusResponse
    version: str


@router.get("/system", response_model=SystemResponse)
def system(request: Request) -> dict[str, object]:
    baseline = backend_status_from_env()
    reachable = getattr(request.app.state, "backend_reachable", baseline["reachable"])
    last_ok_at = getattr(request.app.state, "backend_last_ok_at", baseline["last_ok_at"])
    return {
        "backend": {
            "configured": baseline["configured"],
            "reachable": reachable,
            "last_ok_at": last_ok_at,
        },
        "version": os.environ.get("ML_EDGE_VERSION", "dev"),
    }


__all__ = ["router"]
