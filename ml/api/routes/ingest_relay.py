"""Worker-to-api ingest relay routes."""

from __future__ import annotations

import base64
import binascii
import os
from typing import Any, Protocol

from fastapi import APIRouter, Header, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field

from api.camera_registry import CameraRegistryStore
from api.heartbeat_store import get_heartbeat_store
from api.lifespan import API_FACILITY_ID_ENV, refresh_backend_config
from contracts import AlertEventType
from contracts.worker_config import (
    RESTART_EPOCH_KEY,
    PulledWorkerConfig,
)
from events.edge_ingest_client import EdgeIngestClient

RELAY_TOKEN_HEADER = "X-Edge-Relay-Token"

router = APIRouter(prefix="/relay", tags=["relay"])


class RelayAuditEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid")

    config_version: int | None = None
    model_version: str | None = None
    detector_version: str | None = None
    operating_threshold: float | None = None
    clock_source: str | None = None




class RelayAlertRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_type: AlertEventType
    probability: float = Field(ge=0.0, le=1.0)
    detected_at: str = Field(min_length=1)
    camera_id: str = Field(min_length=1)
    facility_id: str = Field(min_length=1)
    resident_id: str | None = None
    evidence: dict[str, Any] | None = None
    audit: RelayAuditEnvelope | None = None
    snapshot_jpeg_base64: str | None = None


class RelayHeartbeatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    camera_id: str = Field(min_length=1)
    facility_id: str = Field(min_length=1)
    config_version: int | None = None


class BackendIngestClient(Protocol):
    def send_alert(
        self,
        *,
        event_type: AlertEventType,
        detected_at: str,
        probability: float,
        audit: dict[str, object] | None = None,
        snapshot_bytes: bytes | None = None,
    ) -> bool: ...

    def send_heartbeat(self) -> bool: ...


@router.get("/config")
def worker_config(
    request: Request,
    relay_token: str | None = Header(default=None, alias=RELAY_TOKEN_HEADER),
) -> dict[str, object]:
    _authorize(request, relay_token)
    # Re-pull backend config best-effort so a live backend change (e.g. night
    # window) reaches this worker request without an ml-api restart; last-good
    # is preserved on failure.
    refresh_backend_config(request.app)
    cfg = _current_worker_config(request)
    return cfg.as_dict()


@router.post("/restart", status_code=status.HTTP_202_ACCEPTED)
def bump_restart(
    request: Request,
    relay_token: str | None = Header(default=None, alias=RELAY_TOKEN_HEADER),
) -> dict[str, int]:
    _authorize(request, relay_token)
    request.app.state.restart_epoch = int(getattr(request.app.state, "restart_epoch", 0)) + 1
    return {RESTART_EPOCH_KEY: request.app.state.restart_epoch}



@router.post("/alerts", status_code=status.HTTP_202_ACCEPTED)
def relay_alert(
    payload: RelayAlertRequest,
    request: Request,
    relay_token: str | None = Header(default=None, alias=RELAY_TOKEN_HEADER),
) -> dict[str, str]:
    _authorize(request, relay_token)
    _camera_binding(request, payload.camera_id, payload.facility_id)
    client = _backend_ingest_client(request, camera_id=payload.camera_id)
    alert_kwargs: dict[str, object] = {
        "event_type": payload.event_type,
        "detected_at": payload.detected_at,
        "probability": payload.probability,
    }
    # Envelope-less alerts forward the exact prior 3-field shape; audit/snapshot
    # kwargs are added ONLY when present (backward-compat with the route contract).
    if payload.audit is not None:
        alert_kwargs["audit"] = payload.audit.model_dump(exclude_none=True)
    snapshot_bytes = _decode_snapshot(payload.snapshot_jpeg_base64)
    if snapshot_bytes is not None:
        alert_kwargs["snapshot_bytes"] = snapshot_bytes
    accepted = client.send_alert(**alert_kwargs)
    if not accepted:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="backend ingest rejected alert",
        )
    return {"status": "accepted"}


@router.post("/heartbeat", status_code=status.HTTP_202_ACCEPTED)
def relay_heartbeat(
    payload: RelayHeartbeatRequest,
    request: Request,
    relay_token: str | None = Header(default=None, alias=RELAY_TOKEN_HEADER),
) -> dict[str, str]:
    _authorize(request, relay_token)
    _camera_binding(request, payload.camera_id, payload.facility_id)
    # Stamp local liveness AFTER auth + camera binding and BEFORE backend egress
    # so /status reflects edge-local truth even if backend egress fails.
    get_heartbeat_store(request.app).record(
        payload.camera_id,
        payload.facility_id,
        config_version=payload.config_version,
    )
    client = _backend_ingest_client(request, camera_id=payload.camera_id)
    if not client.send_heartbeat():
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="backend ingest rejected heartbeat",
        )
    return {"status": "accepted"}


def _decode_snapshot(snapshot_jpeg_base64: str | None) -> bytes | None:
    if snapshot_jpeg_base64 is None:
        return None
    try:
        return base64.b64decode(snapshot_jpeg_base64, validate=True)
    except (binascii.Error, ValueError):
        return None

def _authorize(request: Request, relay_token: str | None) -> None:
    expected = getattr(request.app.state, "edge_relay_token", None)
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="relay token is not configured",
        )
    if relay_token is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="relay token required")
    if relay_token != expected:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="relay token mismatch")


def _camera_binding(request: Request, camera_id: str, facility_id: str) -> dict[str, str | None]:
    registry_binding = _camera_binding_from_registry(request, camera_id, facility_id)
    if registry_binding is not None:
        return registry_binding
    inventory = getattr(request.app.state, "camera_inventory", {})
    binding = inventory.get(camera_id) if isinstance(inventory, dict) else None
    if binding is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="unknown camera")
    binding_facility = binding.get("facility_id") if isinstance(binding, dict) else None
    if binding_facility != facility_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="camera facility mismatch"
        )
    return dict(binding)


def _camera_binding_from_registry(
    request: Request,
    camera_id: str,
    facility_id: str,
) -> dict[str, str | None] | None:
    store = getattr(request.app.state, "camera_registry", None)
    if not isinstance(store, CameraRegistryStore):
        return None
    snapshot = store.snapshot()
    cameras = snapshot.get("cameras")
    if not isinstance(cameras, list) or not cameras:
        return None
    expected_facility = os.environ.get(API_FACILITY_ID_ENV, "local-facility").strip()
    if expected_facility and facility_id != expected_facility:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="camera facility mismatch"
        )
    for record in cameras:
        if not isinstance(record, dict):
            continue
        canonical_id = record.get("backend_camera_id") or record.get("id")
        if canonical_id == camera_id:
            return {"camera_id": str(canonical_id), "facility_id": facility_id, "resident_id": None}
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="unknown camera")


def _backend_ingest_client(request: Request, *, camera_id: str) -> BackendIngestClient:
    client = getattr(request.app.state, "backend_ingest_client", None)
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="backend ingest client is not configured",
        )
    if isinstance(client, EdgeIngestClient):
        return client.for_camera(camera_id)
    return client


def _current_worker_config(request: Request) -> PulledWorkerConfig:
    pulled = getattr(request.app.state, "pulled_config", None)
    if not isinstance(pulled, PulledWorkerConfig):
        # No real backend-pulled config: signal UNAVAILABLE so the worker's
        # pull returns None and it keeps its own LKG/YAML instead of persisting
        # an empty placeholder over a valid last-known-good config.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="backend config unavailable",
        )
    # Rebuild from LIVE app.state so a restart_epoch/config_version bump is
    # visible without a re-pull.
    return PulledWorkerConfig(
        config_version=int(getattr(request.app.state, "config_version", 0)),
        restart_epoch=int(getattr(request.app.state, "restart_epoch", 0)),
        night_window=pulled.night_window,
        cameras=pulled.cameras,
    )


__all__ = ["router"]
