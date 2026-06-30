"""Serving application lifespan assembly."""

from __future__ import annotations

import json
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from api.heartbeat_store import DEFAULT_STALE_AFTER_SEC, HeartbeatStore
from events.edge_ingest_client import DEFAULT_TIMEOUT_SEC, EdgeIngestClient

API_BACKEND_EVENTS_URL_ENV = "API_BACKEND_EVENTS_URL"
API_EDGE_RELAY_TOKEN_ENV = "API_EDGE_RELAY_TOKEN"
API_CAMERA_INVENTORY_ENV = "API_CAMERA_INVENTORY"
API_BACKEND_INGEST_TIMEOUT_SEC_ENV = "API_BACKEND_INGEST_TIMEOUT_SEC"
API_HEARTBEAT_STALE_AFTER_SEC_ENV = "API_HEARTBEAT_STALE_AFTER_SEC"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Boot ml-api as a thin backend gateway (decision map)."""
    _load_config(app)

    if not isinstance(getattr(app.state, "heartbeat_store", None), HeartbeatStore):
        app.state.heartbeat_store = HeartbeatStore(stale_after_sec=_heartbeat_stale_after_sec())

    _configure_backend_ingest(app)
    app.state.readiness = {"ready": True, "status": "ready"}
    yield


def _configure_backend_ingest(app: FastAPI) -> None:
    if not hasattr(app.state, "edge_relay_token"):
        app.state.edge_relay_token = os.environ.get(API_EDGE_RELAY_TOKEN_ENV)
    if not hasattr(app.state, "camera_inventory"):
        app.state.camera_inventory = _camera_inventory_from_env_or_state(app)
    if hasattr(app.state, "backend_ingest_client"):
        return

    events_url = os.environ.get(API_BACKEND_EVENTS_URL_ENV)
    if not events_url:
        return

    first_camera = next(iter(app.state.camera_inventory.values()), {})
    app.state.backend_ingest_client = EdgeIngestClient(
        events_url=events_url,
        camera_id=str(first_camera.get("camera_id", "api-relay")),
        timeout_sec=_backend_ingest_timeout_sec(),
    )


def _camera_inventory_from_env_or_state(app: FastAPI) -> dict[str, dict[str, str | None]]:
    raw_inventory = os.environ.get(API_CAMERA_INVENTORY_ENV)
    if raw_inventory:
        parsed = json.loads(raw_inventory)
        if not isinstance(parsed, list):
            raise ValueError(f"{API_CAMERA_INVENTORY_ENV} must be a JSON list")
        return _camera_inventory_from_items(parsed)

    camera_configs = getattr(app.state, "camera_configs", ())
    return _camera_inventory_from_items(camera_configs)


def _camera_inventory_from_items(items: object) -> dict[str, dict[str, str | None]]:
    inventory: dict[str, dict[str, str | None]] = {}
    for item in items:
        camera_id = _item_text(item, "camera_id")
        facility_id = _item_text(item, "facility_id")
        if camera_id is None or facility_id is None:
            continue
        inventory[camera_id] = {
            "camera_id": camera_id,
            "facility_id": facility_id,
            "resident_id": _item_text(item, "resident_id"),
        }
    return inventory


def _item_text(item: object, name: str) -> str | None:
    value = item.get(name) if isinstance(item, dict) else getattr(item, name, None)
    if value is None:
        return None
    stripped = str(value).strip()
    return stripped or None


def _backend_ingest_timeout_sec() -> float:
    raw = os.environ.get(API_BACKEND_INGEST_TIMEOUT_SEC_ENV)
    if raw is None:
        return DEFAULT_TIMEOUT_SEC
    return float(raw)


def _heartbeat_stale_after_sec() -> float:
    raw = os.environ.get(API_HEARTBEAT_STALE_AFTER_SEC_ENV)
    if raw is None:
        return DEFAULT_STALE_AFTER_SEC
    return float(raw)


def _load_config(app: FastAPI) -> None:
    loader = getattr(app.state, "config_loader", None)
    if callable(loader):
        app.state.config = loader()
    validator = getattr(app.state, "config_validator", None)
    if callable(validator):
        validator(getattr(app.state, "config", None))
