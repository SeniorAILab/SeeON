"""Serving application lifespan assembly."""

from __future__ import annotations

import json
import os
import sys
import urllib.request
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from api.backend_mapping import BackendCameraMapper, backend_status_from_env, mark_backend_status
from api.camera_registry import CameraRegistryStore
from api.heartbeat_store import DEFAULT_STALE_AFTER_SEC, HeartbeatStore
from contracts.worker_config import (
    PulledCameraConfig,
    PulledNightWindow,
    PulledWorkerConfig,
)
from events.edge_ingest_client import DEFAULT_TIMEOUT_SEC, EdgeIngestClient

API_BACKEND_EVENTS_URL_ENV = "API_BACKEND_EVENTS_URL"
API_EDGE_RELAY_TOKEN_ENV = "API_EDGE_RELAY_TOKEN"
API_CAMERA_INVENTORY_ENV = "API_CAMERA_INVENTORY"
API_FACILITY_ID_ENV = "API_FACILITY_ID"
API_BACKEND_CONFIG_URL_ENV = "API_BACKEND_CONFIG_URL"
API_BACKEND_INGEST_TIMEOUT_SEC_ENV = "API_BACKEND_INGEST_TIMEOUT_SEC"
API_HEARTBEAT_STALE_AFTER_SEC_ENV = "API_HEARTBEAT_STALE_AFTER_SEC"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Boot ml-api as a thin backend gateway (ADR)."""
    _load_config(app)

    if not isinstance(getattr(app.state, "heartbeat_store", None), HeartbeatStore):
        app.state.heartbeat_store = HeartbeatStore(stale_after_sec=_heartbeat_stale_after_sec())

    if not isinstance(getattr(app.state, "camera_registry", None), CameraRegistryStore):
        app.state.camera_registry = CameraRegistryStore.from_env()
    if not isinstance(getattr(app.state, "backend_camera_mapper", None), BackendCameraMapper):
        app.state.backend_camera_mapper = BackendCameraMapper.from_env()
    backend_status = backend_status_from_env()
    app.state.backend_configured = backend_status["configured"]
    app.state.backend_reachable = getattr(
        app.state, "backend_reachable", backend_status["reachable"]
    )
    app.state.backend_last_ok_at = getattr(
        app.state, "backend_last_ok_at", backend_status["last_ok_at"]
    )

    app.state.restart_epoch = getattr(app.state, "restart_epoch", 0)
    app.state.config_version = getattr(app.state, "config_version", 0)
    app.state.pulled_config = getattr(app.state, "pulled_config", None)

    _configure_backend_ingest(app)
    _pull_backend_config(app)
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


def _pull_backend_config(app: FastAPI) -> None:
    """Boot-time backend config pull. On failure leaves pulled_config None so a
    cold start with the backend unreachable serves /config 503 and the worker
    falls back to its own LKG/YAML."""
    cfg = _fetch_backend_config(app)
    if cfg is None:
        app.state.pulled_config = None
        return
    _apply_backend_config(app, cfg)


def refresh_backend_config(app: FastAPI) -> None:
    """Best-effort re-pull so each worker /config request reflects the latest
    backend config (e.g. a live night-window change) WITHOUT an ml-api restart.
    On failure the LAST-GOOD pulled_config is preserved (never blanked), so a
    transient backend blip does not drop live config."""
    cfg = _fetch_backend_config(app)
    if cfg is not None:
        _apply_backend_config(app, cfg)


def _fetch_backend_config(app: FastAPI) -> PulledWorkerConfig | None:
    facility_id = os.environ.get(API_FACILITY_ID_ENV)
    base_url = os.environ.get(API_BACKEND_CONFIG_URL_ENV)
    if not facility_id or not base_url:
        return None
    try:
        url = f'{base_url.rstrip("/")}/{facility_id}'
        with urllib.request.urlopen(url, timeout=_backend_ingest_timeout_sec()) as response:
            parsed = _as_mapping(json.loads(response.read().decode("utf-8")))
        mark_backend_status(app.state, True)
        return PulledWorkerConfig(
            config_version=_backend_config_version(parsed),
            restart_epoch=int(getattr(app.state, "restart_epoch", 0)),
            night_window=_pulled_night_window(parsed.get("nightWindow")),
            cameras=_pulled_cameras(parsed.get("cameras")),
        )
    except Exception as exc:  # noqa: BLE001 - best-effort pull must never crash boot/serve
        print(f"failed to pull backend ml config: {exc}", file=sys.stderr)
        mark_backend_status(app.state, False)
        return None


def _apply_backend_config(app: FastAPI, cfg: PulledWorkerConfig) -> None:
    facility_id = os.environ.get(API_FACILITY_ID_ENV)
    app.state.pulled_config = cfg
    app.state.config_version = cfg.config_version
    app.state.camera_inventory = {
        camera.camera_id: {
            "camera_id": camera.camera_id,
            "facility_id": facility_id,
            "resident_id": None,
        }
        for camera in cfg.cameras
    }


def _as_mapping(value: object) -> dict[str, object]:
    if not isinstance(value, dict):
        raise TypeError("backend config response must be an object")
    return value

def _backend_config_version(data: dict[str, object]) -> int:
    value = data.get("configVersion")
    if isinstance(value, bool) or not isinstance(value, int):
        raise TypeError("configVersion must be an integer")
    return value


def _pulled_night_window(value: object) -> PulledNightWindow | None:
    if value is None:
        return None
    if not isinstance(value, dict):
        raise TypeError("nightWindow must be an object or null")
    return PulledNightWindow(
        start=_require_text(value, "start"),
        end=_require_text(value, "end"),
        tz=_require_text(value, "tz"),
    )


def _pulled_cameras(value: object) -> tuple[PulledCameraConfig, ...]:
    if not isinstance(value, list):
        raise TypeError("cameras must be a list")
    return tuple(_pulled_camera(item) for item in value if isinstance(item, dict))


def _pulled_camera(data: dict[str, object]) -> PulledCameraConfig:
    return PulledCameraConfig(
        camera_id=_require_text(data, "id"),
        space_id=_require_text(data, "spaceId"),
        label=_require_text(data, "label"),
        rtsp_url=_optional_text(data, "rtspUrl"),
        online=bool(data.get("online", False)),
    )


def _require_text(data: dict[str, object], name: str) -> str:
    value = data.get(name)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{name} must be a non-empty string")
    return value


def _optional_text(data: dict[str, object], name: str) -> str | None:
    value = data.get(name)
    if value is None:
        return None
    if not isinstance(value, str):
        raise TypeError(f"{name} must be a string or null")
    return value


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
