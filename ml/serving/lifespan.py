"""Serving application lifespan assembly."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Protocol, runtime_checkable

import numpy as np
from fastapi import FastAPI

from domains import DOMAIN_REGISTRY
from events.local_publisher import LoggingEventPublisher
from events.outbox import Outbox
from runners.device import select_device
from runners.registry import DEFAULT_REGISTRY
from runners.warmup import warmup_runner
from runtime.camera_worker import DomainDetectorProtocol
from runtime.edge_runtime import EdgeRuntime
from runtime.incident_manager import IncidentManager
from runtime.status_store import StatusStore
from serving.model import ModelLoadError, get_model
from serving.pipeline import FallPipeline
from serving.source_registry import SourceRegistryError, get_source_registry
from sources.registry import SourceRegistry


@runtime_checkable
class _ServingModelProtocol(Protocol):
    metadata: _ModelMetadataProtocol

    def predict(self, features: np.ndarray) -> float: ...


@runtime_checkable
class _ModelMetadataProtocol(Protocol):
    window: int


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Boot serving in ADR-029 order and expose runtime state on ``app.state``."""
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
            "serving",
            "serving",
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
            "serving",
            "camera.offline",
            detail=str(exc),
        )
        return None


def _serving_model_or_error(value) -> _ServingModelProtocol:
    if isinstance(value, _ServingModelProtocol):
        return value
    raise ModelLoadError("model does not satisfy serving pipeline contract")


def _enabled_domain_detectors() -> tuple[DomainDetectorProtocol, ...]:
    detectors: list[DomainDetectorProtocol] = []
    for registration in DOMAIN_REGISTRY.values():
        if registration.enabled:
            detectors.append(registration.factory())
    return tuple(detectors)
