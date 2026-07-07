"""Evidence clip playback, labeling, and audit routes."""

from __future__ import annotations

import hmac
import os
from typing import Literal

from fastapi import APIRouter, Header, HTTPException, Query, Request, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field

from api.audit_log import AuditLogStore, post_backend_backup, utc_now_iso
from api.clip_store import ClipStore, LabelRecord, LabelStore
from api.lifespan import API_EDGE_RELAY_TOKEN_ENV

router = APIRouter(tags=["clips"])


class ClipManifestResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    clip_id: str = Field(min_length=1)
    camera_id: str = Field(min_length=1)
    event_ref: str = Field(min_length=1)
    started_at: str = Field(min_length=1)
    duration_s: float = Field(ge=0)
    codec: str = Field(min_length=1)
    path: str = Field(min_length=1)
    finalized: bool


class ListClipsResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    clips: list[ClipManifestResponse]


class LabelClipRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: Literal["TRUE_POSITIVE", "FALSE_POSITIVE"] | None
    reviewer: str | None = Field(default=None, min_length=1)


class LabelClipResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    clip_id: str = Field(min_length=1)
    label: Literal["TRUE_POSITIVE", "FALSE_POSITIVE"] | None
    reviewer: str = Field(min_length=1)
    reviewed_at: str = Field(min_length=1)


class AuditResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    entries: list[dict[str, object]]


@router.get("/clips", response_model=ListClipsResponse)
def list_clips(
    request: Request,
    camera_id: str | None = None,
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> dict[str, object]:
    _authorize(request, authorization)
    manifests = _clip_store(request).list_manifests(camera_id=camera_id)
    return {"clips": [manifest.as_response() for manifest in manifests]}


@router.get("/clips/{clip_id}/video")
def clip_video(
    clip_id: str,
    request: Request,
    authorization: str | None = Header(default=None, alias="Authorization"),
    token: str | None = Query(default=None),
) -> FileResponse:
    actor = _authorize(request, authorization, query_token=token)
    manifest = _get_manifest_or_404(request, clip_id)
    try:
        video_path = _clip_store(request).resolve_video_path(manifest)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="clip video not found",
        ) from exc
    _audit_store(request).append(actor=actor, action="play", clip_id=manifest.clip_id)
    return FileResponse(video_path, media_type=_media_type(video_path.name))


@router.put("/clips/{clip_id}/label", response_model=LabelClipResponse)
def label_clip(
    clip_id: str,
    payload: LabelClipRequest,
    request: Request,
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> dict[str, object]:
    actor = _authorize(request, authorization)
    manifest = _get_manifest_or_404(request, clip_id)
    reviewer = payload.reviewer or actor
    record = LabelRecord(
        clip_id=manifest.clip_id,
        label=payload.label,
        reviewer=reviewer,
        reviewed_at=utc_now_iso(),
    )
    _label_store(request).save(record)
    post_backend_backup("clip_label", record.as_response())
    _audit_store(request).append(actor=reviewer, action="label", clip_id=manifest.clip_id)
    return record.as_response()


@router.get("/audit", response_model=AuditResponse)
def list_audit(
    request: Request,
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> dict[str, object]:
    _authorize(request, authorization)
    return {"entries": _audit_store(request).list_entries()}


def _get_manifest_or_404(request: Request, clip_id: str):
    try:
        manifest = _clip_store(request).get_manifest(clip_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if manifest is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="clip not found")
    return manifest


def _clip_store(request: Request) -> ClipStore:
    store = getattr(request.app.state, "clip_store", None)
    if not isinstance(store, ClipStore):
        store = ClipStore.from_env()
        request.app.state.clip_store = store
    return store


def _label_store(request: Request) -> LabelStore:
    store = getattr(request.app.state, "clip_label_store", None)
    if not isinstance(store, LabelStore):
        store = LabelStore.from_env()
        request.app.state.clip_label_store = store
    return store


def _audit_store(request: Request) -> AuditLogStore:
    store = getattr(request.app.state, "clip_audit_log", None)
    if not isinstance(store, AuditLogStore):
        store = AuditLogStore.from_env()
        request.app.state.clip_audit_log = store
    return store


def _authorize(
    request: Request,
    authorization: str | None,
    *,
    query_token: str | None = None,
) -> str:
    expected = getattr(request.app.state, "edge_relay_token", None) or os.environ.get(
        API_EDGE_RELAY_TOKEN_ENV
    )
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="relay token is not configured",
        )
    supplied = _bearer_token(authorization)
    actor = "bearer"
    if supplied is None and query_token is not None:
        supplied = query_token
        actor = "operator"
    if supplied is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="bearer token required",
        )
    if not hmac.compare_digest(supplied.encode("utf-8"), expected.encode("utf-8")):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="relay token mismatch")
    return actor


def _bearer_token(value: str | None) -> str | None:
    if value is None:
        return None
    prefix = "Bearer "
    if not value.startswith(prefix):
        return None
    token = value[len(prefix) :].strip()
    return token or None


def _media_type(filename: str) -> str:
    suffix = filename.rsplit(".", maxsplit=1)[-1].lower() if "." in filename else ""
    if suffix == "webm":
        return "video/webm"
    if suffix == "mkv":
        return "video/x-matroska"
    return "video/mp4"


__all__ = ["router"]
