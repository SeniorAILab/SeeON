"""Runtime status route.

``/status`` is reconstructed from ml-api's own relay-heartbeat store (decision map):
edge-local liveness per camera, independent of backend egress. It does not read
any worker runtime state (no cross-process shared state).
"""

from __future__ import annotations

from fastapi import APIRouter, Request

from api.heartbeat_store import get_heartbeat_store

router = APIRouter(tags=["status"])


@router.get("/status")
def status(request: Request) -> dict[str, object]:
    store = get_heartbeat_store(request.app)
    inventory = getattr(request.app.state, "camera_inventory", {})
    return store.snapshot(inventory)
