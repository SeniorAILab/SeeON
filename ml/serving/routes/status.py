"""Runtime status route."""

from __future__ import annotations

from fastapi import APIRouter, Request

from runtime.status_store import StatusStore

router = APIRouter(tags=["status"])


@router.get("/status")
def status(request: Request) -> dict[str, object]:
    runtime = getattr(request.app.state, "runtime", None)
    if runtime is not None:
        return runtime.status_snapshot()
    store = getattr(request.app.state, "status_store", None)
    if store is None:
        store = StatusStore()
    return store.snapshot()
