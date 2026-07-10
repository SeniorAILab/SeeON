"""Worker-to-api ingest relay routes."""

from __future__ import annotations

import base64
import binascii
import os
from typing import Any, Protocol

from fastapi import APIRouter, Header, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field, field_validator

from api.camera_registry import CameraRegistryStore
from api.heartbeat_store import get_heartbeat_store
from api.lifespan import API_EDGE_RELAY_TOKEN_ENV, API_FACILITY_ID_ENV, refresh_backend_config
from api.routes.cameras import worker_config_snapshot
from api.runtime_status_store import get_runtime_status_store
from contracts import AlertEventType
from contracts.decode_diagnostics import DECODE_BACKENDS, DECODE_FALLBACK_REASONS
from contracts.worker_config import RESTART_EPOCH_KEY
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


class RelayDecodeDiagnostics(BaseModel):
    model_config = ConfigDict(extra="forbid")

    requested: str = Field(min_length=1)
    selected: str | None = Field(default=None)
    fallback_count: int = Field(ge=0)
    last_reason: str | None = Field(default=None)
    updated_at_sec: float = Field()

    @field_validator("requested", "selected")
    @classmethod
    def valid_backend(cls, value: str | None) -> str | None:
        if value is not None and value not in DECODE_BACKENDS:
            raise ValueError("decode backend is invalid")
        return value

    @field_validator("last_reason")
    @classmethod
    def valid_last_reason(cls, value: str | None) -> str | None:
        if value is not None and value not in DECODE_FALLBACK_REASONS:
            raise ValueError("last_reason is not a decode fallback reason")
        return value


class RelayRuntimeStatusCamera(BaseModel):
    model_config = ConfigDict(extra="forbid")

    camera_id: str = Field(min_length=1)
    decode: RelayDecodeDiagnostics


class RelayClipRecorderStatus(BaseModel):
    model_config = ConfigDict(extra="forbid")

    available: bool = Field()
    dropped_frames: int | None = Field(default=None, ge=0)
    dropped_events: int | None = Field(default=None, ge=0)
    failed_writes: int | None = Field(default=None, ge=0)
    finalized_clips: int | None = Field(default=None, ge=0)
    video_unavailable_clips: int | None = Field(default=None, ge=0)
    active_clips: int | None = Field(default=None, ge=0)
    encoder: str | None = Field(default=None)


class RelayRuntimeStatusRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    facility_id: str = Field(min_length=1)
    generation: int | None = Field(default=None, ge=0)
    seq: int = Field(ge=0)
    cameras: list[RelayRuntimeStatusCamera] = Field()
    clip_recorder: RelayClipRecorderStatus


class RelayRuntimeStatusResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    accepted: bool
    generation: int


class BackendIngestClient(Protocol):
    def send_alert(
        self,
        *,
        event_type: AlertEventType,
        detected_at: str,
        probability: float,
        audit: dict[str, object] | None = None,
        snapshot_bytes: bytes | None = None,
        clip_id: str | None = None,
    ) -> bool: ...

    def send_heartbeat(self) -> bool: ...


@router.get("/config")
def worker_config(
    request: Request,
    relay_token: str | None = Header(default=None, alias=RELAY_TOKEN_HEADER),
) -> dict[str, object]:
    _authorize(request, relay_token)
    refresh_backend_config(request.app)
    return worker_config_snapshot(request, require_available=True)


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
    clip_id = _payload_clip_id(payload)
    if clip_id is not None:
        alert_kwargs["clip_id"] = clip_id
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
@router.post("/runtime-status", response_model=RelayRuntimeStatusResponse)
def relay_runtime_status(
    payload: RelayRuntimeStatusRequest,
    request: Request,
    relay_token: str | None = Header(default=None, alias=RELAY_TOKEN_HEADER),
    authorization: str | None = Header(default=None),
) -> RelayRuntimeStatusResponse:
    _authorize(request, relay_token or _bearer_token(authorization))
    _runtime_status_facility_binding(request, payload.facility_id)
    for camera in payload.cameras:
        _camera_binding(request, camera.camera_id, payload.facility_id)
    result = get_runtime_status_store(request.app).record(payload.model_dump())
    if not result.accepted:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=result.reason)
    return RelayRuntimeStatusResponse(accepted=True, generation=result.generation)




def _decode_snapshot(snapshot_jpeg_base64: str | None) -> bytes | None:
    if snapshot_jpeg_base64 is None:
        return None
    try:
        return base64.b64decode(snapshot_jpeg_base64, validate=True)
    except (binascii.Error, ValueError):
        return None


def _authorize(request: Request, relay_token: str | None) -> None:
    expected = getattr(request.app.state, "edge_relay_token", None) or os.environ.get(
        API_EDGE_RELAY_TOKEN_ENV
    )
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="relay token is not configured",
        )
    if relay_token is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="relay token required")
    if relay_token != expected:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="relay token mismatch")
def _bearer_token(authorization: str | None) -> str | None:
    if authorization is None:
        return None
    scheme, separator, token = authorization.partition(" ")
    if separator and scheme.lower() == "bearer" and token:
        return token
    return None


def _runtime_status_facility_binding(request: Request, facility_id: str) -> None:
    expected = os.environ.get(API_FACILITY_ID_ENV)
    if expected and facility_id != expected.strip():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="camera facility mismatch",
        )
    inventory = getattr(request.app.state, "camera_inventory", {})
    if not isinstance(inventory, dict) or not inventory:
        return
    facilities = {
        binding.get("facility_id")
        for binding in inventory.values()
        if isinstance(binding, dict) and binding.get("facility_id") is not None
    }
    if facilities and facility_id not in facilities:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="camera facility mismatch",
        )



def _payload_clip_id(payload: RelayAlertRequest) -> str | None:
    if payload.evidence is None:
        return None
    value = payload.evidence.get("clip_id")
    if isinstance(value, str) and value.strip() != "":
        return value
    return None

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



__all__ = ["router"]
