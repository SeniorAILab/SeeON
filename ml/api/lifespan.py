"""Serving application lifespan assembly."""

from __future__ import annotations
import json
import os

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Protocol, runtime_checkable

import numpy as np
from fastapi import FastAPI

from api.model import ModelLoadError, get_model
from api.pipeline import FallPipeline
from api.source_registry import SourceRegistryError, get_source_registry
from domains import DOMAIN_REGISTRY
from events.edge_ingest_client import DEFAULT_TIMEOUT_SEC, EdgeIngestClient
from events.local_publisher import LoggingEventPublisher
from events.outbox import Outbox
from runners.device import select_device
from runners.registry import DEFAULT_REGISTRY
from runners.warmup import warmup_runner
from runtime.camera_worker import DomainDetectorProtocol
from runtime.edge_runtime import EdgeRuntime
from runtime.incident_manager import IncidentManager
from runtime.status_store import StatusStore
from sources.registry import SourceRegistry
API_BACKEND_ALERT_URL_ENV = "API_BACKEND_ALERT_URL"
API_BACKEND_HEARTBEAT_URL_ENV = "API_BACKEND_HEARTBEAT_URL"
API_INGEST_KEY_ID_ENV = "API_INGEST_KEY_ID"
API_INGEST_SECRET_ENV = "API_INGEST_SECRET"
API_EDGE_RELAY_TOKEN_ENV = "API_EDGE_RELAY_TOKEN"
API_CAMERA_INVENTORY_ENV = "API_CAMERA_INVENTORY"
API_BACKEND_INGEST_TIMEOUT_SEC_ENV = "API_BACKEND_INGEST_TIMEOUT_SEC"


@runtime_checkable
class _ServingModelProtocol(Protocol):
    metadata: _ModelMetadataProtocol

    def predict(self, features: np.ndarray) -> float: ...


@runtime_checkable
class _ModelMetadataProtocol(Protocol):
    window: int


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Boot api in ADR-029 order and expose runtime state on ``app.state``."""
    _load_config(app)
    device_selector = getattr(app.state, "device_selector", select_device)
    app.state.device = device_selector() if callable(device_selector) else device_selector
    app.state.model_registry = getattr(app.state, "model_registry", DEFAULT_REGISTRY)
    status_store = getattr(app.state, "status_store", StatusStore())
    app.state.status_store = status_store

    model = _warm_model(app, status_store)
    app.state.model = model
    app.state.fall_pipeline = getattr(app.state, "fall_pipeline", None) or (
        FallPipeline(model) if model is not None else None
    )

    incident_manager = getattr(app.state, "incident_manager", IncidentManager())
    publisher = getattr(app.state, "event_publisher", LoggingEventPublisher())
    outbox = getattr(app.state, "outbox", Outbox(publisher))
    app.state.incident_manager = incident_manager
    app.state.event_publisher = publisher
    app.state.outbox = outbox
    _configure_backend_ingest(app)

    source_registry = _resolve_sources(app, status_store)
    app.state.source_registry = source_registry
    camera_configs = tuple(getattr(app.state, "camera_configs", ()))
    domain_detectors = _enabled_domain_detectors()
    app.state.domain_detectors = domain_detectors
    runtime = EdgeRuntime(
        event_sink=getattr(app.state, "event_sink", outbox),
        camera_configs=camera_configs,
        observation_builder=getattr(app.state, "observation_builder", None),
        status_store=status_store,
        incident_manager=incident_manager,
    )
    app.state.runtime = runtime
    app.state.readiness = (
        {"ready": True, "status": "ready"}
        if model is not None
        else {"ready": False, "status": "not_ready", "reason": "model.load_failed"}
    )
    try:
        yield
    finally:
        close = getattr(publisher, "close", None)
        if callable(close):
            close()


def _configure_backend_ingest(app: FastAPI) -> None:
    if not hasattr(app.state, "edge_relay_token"):
        app.state.edge_relay_token = os.environ.get(API_EDGE_RELAY_TOKEN_ENV)
    if not hasattr(app.state, "camera_inventory"):
        app.state.camera_inventory = _camera_inventory_from_env_or_state(app)
    if hasattr(app.state, "backend_ingest_client"):
        return

    alert_url = os.environ.get(API_BACKEND_ALERT_URL_ENV)
    heartbeat_url = os.environ.get(API_BACKEND_HEARTBEAT_URL_ENV)
    ingest_key_id = os.environ.get(API_INGEST_KEY_ID_ENV)
    ingest_secret = os.environ.get(API_INGEST_SECRET_ENV)
    if not all((alert_url, heartbeat_url, ingest_key_id, ingest_secret)):
        return

    first_camera = next(iter(app.state.camera_inventory.values()), {})
    app.state.backend_ingest_client = EdgeIngestClient(
        alert_url=alert_url,
        heartbeat_url=heartbeat_url,
        camera_id=str(first_camera.get("camera_id", "api-relay")),
        facility_id=str(first_camera.get("facility_id", "api-relay")),
        resident_id=first_camera.get("resident_id"),
        ingest_key_id=ingest_key_id,
        ingest_secret=ingest_secret,
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

def _load_config(app: FastAPI) -> None:
    loader = getattr(app.state, "config_loader", None)
    if callable(loader):
        app.state.config = loader()
    validator = getattr(app.state, "config_validator", None)
    if callable(validator):
        validator(getattr(app.state, "config", None))


def _warm_model(app: FastAPI, status_store: StatusStore) -> _ServingModelProtocol | None:
    try:
        loader = getattr(app.state, "model_loader", get_model)
        model = loader()
        warmer = getattr(app.state, "runner_warmup", warmup_runner)
        return _serving_model_or_error(warmer(model))
    except ModelLoadError as exc:
        status_store.record_ops_event(
            "model.load_failed",
            "api",
            "api",
            "model.load_failed",
            detail=str(exc),
        )
        app.state.model_load_error = str(exc)
        return None


def _resolve_sources(app: FastAPI, status_store: StatusStore) -> SourceRegistry | None:
    try:
        resolver = getattr(app.state, "source_registry_loader", get_source_registry)
        return resolver()
    except SourceRegistryError as exc:
        status_store.record_ops_event(
            "camera.offline",
            "sources",
            "api",
            "camera.offline",
            detail=str(exc),
        )
        return None


def _serving_model_or_error(value) -> _ServingModelProtocol:
    if isinstance(value, _ServingModelProtocol):
        return value
    raise ModelLoadError("model does not satisfy api pipeline contract")


def _enabled_domain_detectors() -> tuple[DomainDetectorProtocol, ...]:
    detectors: list[DomainDetectorProtocol] = []
    for registration in DOMAIN_REGISTRY.values():
        if registration.enabled:
            detectors.append(registration.factory())
    return tuple(detectors)
