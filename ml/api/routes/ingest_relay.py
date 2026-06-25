"""Worker-to-api ingest relay routes."""

from __future__ import annotations

from typing import Any, Protocol

from fastapi import APIRouter, Header, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field

from events.schemas import AlertEventType

RELAY_TOKEN_HEADER = "X-Edge-Relay-Token"

router = APIRouter(prefix="/relay", tags=["relay"])


class RelayAlertRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_type: AlertEventType
    probability: float = Field(ge=0.0, le=1.0)
    detected_at: str = Field(min_length=1)
    camera_id: str = Field(min_length=1)
    facility_id: str = Field(min_length=1)
    resident_id: str | None = None
    evidence: dict[str, Any] | None = None


class RelayHeartbeatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    camera_id: str = Field(min_length=1)
    facility_id: str = Field(min_length=1)


class BackendIngestClient(Protocol):
    def send_alert(
        self,
        *,
        event_type: AlertEventType,
        detected_at: str,
        probability: float,
        facility_id: str | None = None,
        resident_id: str | None = None,
    ) -> bool: ...

    def send_heartbeat(self) -> bool: ...


@router.post("/alerts", status_code=status.HTTP_202_ACCEPTED)
def relay_alert(
    payload: RelayAlertRequest,
    request: Request,
    relay_token: str | None = Header(default=None, alias=RELAY_TOKEN_HEADER),
) -> dict[str, str]:
    _authorize(request, relay_token)
    binding = _camera_binding(request, payload.camera_id, payload.facility_id)
    resident_id = payload.resident_id or binding.get("resident_id")
    client = _backend_ingest_client(request)
    accepted = client.send_alert(
        event_type=payload.event_type,
        detected_at=payload.detected_at,
        probability=payload.probability,
        facility_id=payload.facility_id,
        resident_id=resident_id,
    )
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
    client = _backend_ingest_client(request)
    if not client.send_heartbeat():
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="backend ingest rejected heartbeat",
        )
    return {"status": "accepted"}


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


def _backend_ingest_client(request: Request) -> BackendIngestClient:
    client = getattr(request.app.state, "backend_ingest_client", None)
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="backend ingest client is not configured",
        )
    return client


__all__ = ["router"]
