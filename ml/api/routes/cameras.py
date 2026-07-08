"""Camera registry routes."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
import uuid
from typing import Literal

from fastapi import APIRouter, Header, HTTPException, Request, Response, status
from pydantic import BaseModel, ConfigDict, Field

from api.backend_mapping import BackendCameraMapper, MappingResult, mark_backend_status
from api.camera_registry import (
    CameraRegistryStore,
    ProbeErrorClass,
    ProbeResult,
    public_camera,
    status_from_probe,
)
from api.config import get_settings
from api.lifespan import API_EDGE_RELAY_TOKEN_ENV, API_FACILITY_ID_ENV
from contracts.worker_config import PulledWorkerConfig

RELAY_TOKEN_HEADER = "X-Edge-Relay-Token"

router = APIRouter(prefix="/cameras", tags=["cameras"])


class CameraResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    label: str = Field(min_length=1)
    rtsp_url_masked: str = Field(min_length=1)
    space_id: str | None = None
    backend_camera_id: str | None = None
    status: Literal["online", "offline", "starting", "unknown"]
    created_at: str = Field(min_length=1)


class ListCamerasResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    registry_version: int = Field(ge=0)
    cameras: list[CameraResponse]


class CreateCameraRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: str = Field(min_length=1)
    rtsp_url: str = Field(min_length=1)
    space_id: str | None = None


class UpdateCameraRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: str | None = Field(default=None, min_length=1)
    rtsp_url: str | None = Field(default=None, min_length=1)
    space_id: str | None = None


class TestCameraResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ok: bool
    error_class: Literal["timeout", "decode", "auth"] | None = None
    width: int | None = None
    height: int | None = None


class WorkerCameraConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    camera_id: str = Field(min_length=1)
    facility_id: str = Field(min_length=1)
    rtsp_url: str = Field(min_length=1)
    fps: float | None = Field(default=None, gt=0)
    domains: list[str] | None = None


class WorkerConfigResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    registry_version: int = Field(ge=0)
    cameras: list[WorkerCameraConfig]
    config_version: int | None = Field(default=None, ge=0)
    restart_epoch: int | None = Field(default=None, ge=0)
    night_window: dict[str, object] | None = None


@router.get("", response_model=ListCamerasResponse)
def list_cameras(
    request: Request,
    relay_token: str | None = Header(default=None, alias=RELAY_TOKEN_HEADER),
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> dict[str, object]:
    _authorize(request, relay_token, authorization)
    return _public_snapshot(_store(request).snapshot())


@router.post("", status_code=status.HTTP_201_CREATED, response_model=CameraResponse)
def create_camera(
    payload: CreateCameraRequest,
    request: Request,
    relay_token: str | None = Header(default=None, alias=RELAY_TOKEN_HEADER),
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> dict[str, object]:
    _authorize(request, relay_token, authorization)
    probe = _probe_rtsp_url(request, payload.rtsp_url)
    provisional_id = str(uuid.uuid4())
    mapping = _map_backend(
        request,
        camera_id=provisional_id,
        label=payload.label,
        space_id=payload.space_id,
    )
    camera_id = mapping.backend_camera_id or provisional_id
    record = _store(request).create(
        camera_id=camera_id,
        label=payload.label,
        rtsp_url=payload.rtsp_url,
        space_id=payload.space_id,
        status=status_from_probe(probe),
        backend_camera_id=mapping.backend_camera_id,
        mapping_pending=mapping.pending,
    )
    return public_camera(record)


@router.post(
    "/{camera_id}/test",
    response_model=TestCameraResponse,
    response_model_exclude_none=True,
)
def test_camera(
    camera_id: str,
    request: Request,
    relay_token: str | None = Header(default=None, alias=RELAY_TOKEN_HEADER),
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> dict[str, object]:
    _authorize(request, relay_token, authorization)
    record = _store(request).get(camera_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="camera not found")
    probe = _probe_rtsp_url(request, str(record.get("rtsp_url", "")))
    return _probe_response(probe)


@router.patch("/{camera_id}", response_model=CameraResponse)
def update_camera(
    camera_id: str,
    payload: UpdateCameraRequest,
    request: Request,
    relay_token: str | None = Header(default=None, alias=RELAY_TOKEN_HEADER),
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> dict[str, object]:
    _authorize(request, relay_token, authorization)
    current = _store(request).get(camera_id)
    if current is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="camera not found")
    if not payload.model_fields_set:
        return public_camera(current)
    updates: dict[str, object] = {}
    next_label = str(current.get("label", ""))
    next_space_id = current.get("space_id") if current.get("space_id") is not None else None
    if "label" in payload.model_fields_set and payload.label is not None:
        updates["label"] = payload.label
        next_label = payload.label
    if "rtsp_url" in payload.model_fields_set and payload.rtsp_url is not None:
        updates["rtsp_url"] = payload.rtsp_url
        updates["status"] = status_from_probe(_probe_rtsp_url(request, payload.rtsp_url))
    if "space_id" in payload.model_fields_set:
        updates["space_id"] = payload.space_id
        next_space_id = payload.space_id

    if "space_id" in payload.model_fields_set or "label" in payload.model_fields_set:
        mapping = _map_backend(
            request,
            camera_id=camera_id,
            label=next_label,
            space_id=next_space_id if isinstance(next_space_id, str) else None,
        )
        if mapping.backend_camera_id is not None:
            updates["id"] = mapping.backend_camera_id
            updates["backend_camera_id"] = mapping.backend_camera_id
        elif current.get("backend_camera_id") is None:
            updates["backend_camera_id"] = None
        updates["mapping_pending"] = mapping.pending

    updated = _store(request).update(camera_id, updates)
    if updated is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="camera not found")
    return public_camera(updated)


@router.delete("/{camera_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_camera(
    camera_id: str,
    request: Request,
    relay_token: str | None = Header(default=None, alias=RELAY_TOKEN_HEADER),
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> Response:
    _authorize(request, relay_token, authorization)
    if not _store(request).delete(camera_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="camera not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/worker-config", response_model=WorkerConfigResponse, response_model_exclude_none=True)
def worker_config(
    request: Request,
    relay_token: str | None = Header(default=None, alias=RELAY_TOKEN_HEADER),
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> dict[str, object]:
    _authorize(request, relay_token, authorization)
    return worker_config_snapshot(request)


def worker_config_snapshot(
    request: Request, *, require_available: bool = False
) -> dict[str, object]:
    snapshot = _store(request).snapshot()
    facility_id = _facility_id()
    cameras = []
    for record in _snapshot_camera_records(snapshot):
        rtsp_url = record.get("rtsp_url")
        if not isinstance(rtsp_url, str) or not rtsp_url.strip():
            continue
        canonical_id = record.get("backend_camera_id") or record.get("id", "")
        cameras.append(
            {
                "camera_id": str(canonical_id),
                "facility_id": facility_id,
                "rtsp_url": rtsp_url,
            }
        )
    pulled = getattr(request.app.state, "pulled_config", None)
    if not cameras and isinstance(pulled, PulledWorkerConfig):
        cameras = _worker_cameras_from_pulled_config(pulled, facility_id)
    if require_available and not cameras:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="worker config unavailable",
        )
    response: dict[str, object] = {
        "registry_version": snapshot["registry_version"],
        "cameras": cameras,
    }
    if isinstance(pulled, PulledWorkerConfig):
        live_pulled = _live_pulled_config(request, pulled)
        response["config_version"] = live_pulled.config_version
        response["restart_epoch"] = live_pulled.restart_epoch
        if live_pulled.night_window is not None:
            response["night_window"] = live_pulled.night_window.as_dict()
    return response


def _worker_cameras_from_pulled_config(
    pulled: PulledWorkerConfig, facility_id: str
) -> list[dict[str, object]]:
    cameras: list[dict[str, object]] = []
    for camera in pulled.cameras:
        if camera.rtsp_url is None or not camera.rtsp_url.strip():
            continue
        cameras.append(
            {
                "camera_id": camera.camera_id,
                "facility_id": facility_id,
                "rtsp_url": camera.rtsp_url,
            }
        )
    return cameras

def _live_pulled_config(request: Request, pulled: PulledWorkerConfig) -> PulledWorkerConfig:
    return PulledWorkerConfig(
        config_version=int(getattr(request.app.state, "config_version", 0)),
        restart_epoch=int(getattr(request.app.state, "restart_epoch", 0)),
        night_window=pulled.night_window,
        cameras=pulled.cameras,
    )

def retry_pending_backend_mappings(request: Request) -> int:
    store = _store(request)
    retried = 0
    for record in _snapshot_camera_records(store.snapshot()):
        if not record.get("mapping_pending"):
            continue
        space_id = record.get("space_id")
        label = record.get("label")
        camera_id = record.get("id")
        if not isinstance(space_id, str) or not space_id.strip():
            continue
        if not isinstance(label, str) or not label.strip():
            continue
        if not isinstance(camera_id, str) or not camera_id.strip():
            continue
        mapping = _map_backend(request, camera_id=camera_id, label=label, space_id=space_id)
        if mapping.backend_camera_id is None:
            continue
        store.update(
            camera_id,
            {"backend_camera_id": mapping.backend_camera_id, "mapping_pending": mapping.pending},
        )
        retried += 1
    return retried



def _public_snapshot(snapshot: dict[str, object]) -> dict[str, object]:
    return {
        "registry_version": snapshot["registry_version"],
        "cameras": [public_camera(record) for record in _snapshot_camera_records(snapshot)],
    }


def _snapshot_camera_records(snapshot: dict[str, object]) -> list[dict[str, object]]:
    cameras = snapshot.get("cameras")
    if not isinstance(cameras, list):
        return []
    return [record for record in cameras if isinstance(record, dict)]


def _store(request: Request) -> CameraRegistryStore:
    store = getattr(request.app.state, "camera_registry", None)
    if not isinstance(store, CameraRegistryStore):
        store = CameraRegistryStore.from_env()
        request.app.state.camera_registry = store
    return store


def _mapper(request: Request) -> BackendCameraMapper:
    mapper = getattr(request.app.state, "backend_camera_mapper", None)
    if not isinstance(mapper, BackendCameraMapper):
        mapper = BackendCameraMapper.from_env()
        request.app.state.backend_camera_mapper = mapper
    return mapper


def _map_backend(
    request: Request,
    *,
    camera_id: str,
    label: str,
    space_id: str | None,
) -> MappingResult:
    mapper = _mapper(request)
    if space_id is None:
        return MappingResult(backend_camera_id=None, pending=False, reachable=None)
    result = mapper.put_mapping(edge_camera_ref=camera_id, label=label, space_id=space_id)
    mark_backend_status(request.app.state, result.reachable)
    return result


def _authorize(request: Request, relay_token: str | None, authorization: str | None) -> None:
    expected = getattr(request.app.state, "edge_relay_token", None) or os.environ.get(
        API_EDGE_RELAY_TOKEN_ENV
    )
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="relay token is not configured",
        )
    bearer = _bearer_token(authorization)
    supplied = relay_token if relay_token is not None else bearer
    if supplied is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="relay token required")
    if supplied != expected:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="relay token mismatch")


def _bearer_token(value: str | None) -> str | None:
    if value is None:
        return None
    prefix = "Bearer "
    if not value.startswith(prefix):
        return None
    token = value[len(prefix) :].strip()
    return token or None


def _facility_id() -> str:
    return os.environ.get(API_FACILITY_ID_ENV, "local-facility").strip() or "local-facility"


def _probe_rtsp_url(request: Request, rtsp_url: str) -> ProbeResult:
    settings = get_settings()
    origin = settings.worker_probe_origin.strip().rstrip("/")
    if not origin:
        return ProbeResult(ok=False, error_class="decode")
    token = _expected_relay_token(request)
    if token is None:
        return ProbeResult(ok=False, error_class="decode")
    body = json.dumps({"rtsp_url": rtsp_url}, separators=(",", ":")).encode("utf-8")
    probe_request = urllib.request.Request(
        f"{origin}/probe",
        data=body,
        headers={
            "Content-Type": "application/json",
            RELAY_TOKEN_HEADER: token,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(
            probe_request,
            timeout=settings.worker_probe_timeout_s,
        ) as response:
            payload = json.loads(response.read().decode("utf-8") or "{}")
    except TimeoutError:
        return ProbeResult(ok=False, error_class="timeout")
    except (OSError, urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError):
        return ProbeResult(ok=False, error_class="decode")
    if not isinstance(payload, dict):
        return ProbeResult(ok=False, error_class="decode")
    return _probe_result_from_worker(payload)


def _probe_result_from_worker(payload: dict[object, object]) -> ProbeResult:
    raw_error_class = payload.get("error_class")
    error_class: ProbeErrorClass | None
    if raw_error_class == "timeout":
        error_class = "timeout"
    elif raw_error_class == "decode":
        error_class = "decode"
    elif raw_error_class == "auth":
        error_class = "auth"
    else:
        error_class = None
    width = _optional_positive_int(payload.get("width"))
    height = _optional_positive_int(payload.get("height"))
    return ProbeResult(
        ok=payload.get("ok") is True,
        error_class=error_class,
        width=width,
        height=height,
    )


def _optional_positive_int(value: object) -> int | None:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        return None
    return value


def _expected_relay_token(request: Request) -> str | None:
    expected = getattr(request.app.state, "edge_relay_token", None) or os.environ.get(
        API_EDGE_RELAY_TOKEN_ENV
    )
    return expected if isinstance(expected, str) and expected else None


def _probe_response(probe: ProbeResult) -> dict[str, object]:
    response: dict[str, object] = {"ok": probe.ok}
    if probe.error_class is not None:
        response["error_class"] = probe.error_class
    if probe.width is not None:
        response["width"] = probe.width
    if probe.height is not None:
        response["height"] = probe.height
    return response


__all__ = ["retry_pending_backend_mappings", "router", "worker_config_snapshot"]
