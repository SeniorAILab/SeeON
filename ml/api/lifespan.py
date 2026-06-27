"""Serving application lifespan assembly."""

from __future__ import annotations

import json
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Protocol, runtime_checkable

import numpy as np
from fastapi import FastAPI

from api.heartbeat_store import DEFAULT_STALE_AFTER_SEC, HeartbeatStore
from api.model import ModelLoadError, get_model
from api.pipeline import FallPipeline
from api.source_registry import SourceRegistryError, get_source_registry
from events.edge_ingest_client import DEFAULT_TIMEOUT_SEC, EdgeIngestClient
from runners.device import select_device
from runners.registry import DEFAULT_REGISTRY
from runners.warmup import warmup_runner
from sources.registry import SourceRegistry

API_BACKEND_EVENTS_URL_ENV = "API_BACKEND_EVENTS_URL"
API_EDGE_RELAY_TOKEN_ENV = "API_EDGE_RELAY_TOKEN"
API_CAMERA_INVENTORY_ENV = "API_CAMERA_INVENTORY"
API_BACKEND_INGEST_TIMEOUT_SEC_ENV = "API_BACKEND_INGEST_TIMEOUT_SEC"
API_HEARTBEAT_STALE_AFTER_SEC_ENV = "API_HEARTBEAT_STALE_AFTER_SEC"


@runtime_checkable
class _ServingModelProtocol(Protocol):
    metadata: _ModelMetadataProtocol

    def predict(self, features: np.ndarray) -> float: ...


@runtime_checkable
class _ModelMetadataProtocol(Protocol):
    window: int


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Boot ml-api as a thin backend gateway + debug surface (ADR-067).

    ml-api does NOT assemble live camera loops (a worker concern; the old
    serving-starts-workers path is removed). It warms the bounded debug model,
    prepares the single backend-ingest gateway, and exposes ``/status`` derived
    from its own relay-heartbeat store. No worker runtime is imported or started,
    and there is no cross-process shared state with the worker.
    """
    _load_config(app)
    device_selector = getattr(app.state, "device_selector", select_device)
    app.state.device = device_selector() if callable(device_selector) else device_selector
    app.state.model_registry = getattr(app.state, "model_registry", DEFAULT_REGISTRY)

    if not isinstance(getattr(app.state, "heartbeat_store", None), HeartbeatStore):
        app.state.heartbeat_store = HeartbeatStore(stale_after_sec=_heartbeat_stale_after_sec())

    model = _warm_model(app)
    app.state.model = model
    app.state.fall_pipeline = getattr(app.state, "fall_pipeline", None) or (
        FallPipeline(model) if model is not None else None
    )

    _configure_backend_ingest(app)

    app.state.source_registry = _resolve_sources(app)
    app.state.readiness = (
        {"ready": True, "status": "ready"}
        if model is not None
        else {"ready": False, "status": "not_ready", "reason": "model.load_failed"}
    )
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


def _warm_model(app: FastAPI) -> _ServingModelProtocol | None:
    try:
        loader = getattr(app.state, "model_loader", get_model)
        model = loader()
        warmer = getattr(app.state, "runner_warmup", warmup_runner)
        return _serving_model_or_error(warmer(model))
    except ModelLoadError as exc:
        app.state.model_load_error = str(exc)
        return None


def _resolve_sources(app: FastAPI) -> SourceRegistry | None:
    try:
        resolver = getattr(app.state, "source_registry_loader", get_source_registry)
        return resolver()
    except SourceRegistryError:
        return None


def _serving_model_or_error(value) -> _ServingModelProtocol:
    if isinstance(value, _ServingModelProtocol):
        return value
    raise ModelLoadError("model does not satisfy api pipeline contract")
