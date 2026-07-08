from __future__ import annotations

import hmac
import os
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Iterator
from typing import Annotated, Protocol

from fastapi import APIRouter, Header, HTTPException, Query, Request, status
from fastapi.responses import Response, StreamingResponse

from api.config import get_settings
from api.lifespan import API_EDGE_RELAY_TOKEN_ENV

router = APIRouter(tags=["streams"])

_DEFAULT_MEDIA_TYPE = "multipart/x-mixed-replace; boundary=frame"
_STREAM_CHUNK_SIZE = 64 * 1024


class _ResponseHeaders(Protocol):
    def get(self, name: str, default: str | None = None) -> str | None: ...


class _ReadableResponse(Protocol):
    status: int
    headers: _ResponseHeaders

    def read(self, size: int = -1) -> bytes: ...

    def close(self) -> None: ...


@router.get("/streams/{camera_id}")
def camera_stream(
    camera_id: str,
    request: Request,
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
    token: Annotated[str | None, Query()] = None,
) -> StreamingResponse:
    _authorize(request, authorization, query_token=token)
    settings = get_settings()
    upstream_url = _stream_url(settings.worker_stream_origin, camera_id)
    upstream_request = urllib.request.Request(upstream_url, method="GET")

    try:
        upstream: _ReadableResponse = urllib.request.urlopen(
            upstream_request,
            timeout=settings.worker_stream_timeout_s,
        )
    except urllib.error.HTTPError as exc:
        raise _upstream_unavailable(exc.code) from exc
    except urllib.error.URLError as exc:
        raise _upstream_unavailable(status.HTTP_503_SERVICE_UNAVAILABLE) from exc

    upstream_status = int(getattr(upstream, "status", status.HTTP_200_OK))
    if upstream_status != status.HTTP_200_OK:
        upstream.close()
        raise _upstream_unavailable(upstream_status)

    return StreamingResponse(
        _iter_upstream(upstream),
        media_type=_content_type(upstream),
    )


@router.get("/streams/{camera_id}/snapshot")
def camera_snapshot(
    camera_id: str,
    request: Request,
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
    token: Annotated[str | None, Query()] = None,
) -> Response:
    _authorize(request, authorization, query_token=token)
    settings = get_settings()
    upstream_url = _snapshot_url(settings.worker_stream_origin, camera_id)
    upstream_request = urllib.request.Request(upstream_url, method="GET")

    try:
        upstream: _ReadableResponse = urllib.request.urlopen(
            upstream_request,
            timeout=settings.worker_stream_timeout_s,
        )
    except urllib.error.HTTPError as exc:
        raise _upstream_unavailable(exc.code) from exc
    except urllib.error.URLError as exc:
        raise _upstream_unavailable(status.HTTP_503_SERVICE_UNAVAILABLE) from exc

    upstream_status = int(getattr(upstream, "status", status.HTTP_200_OK))
    if upstream_status != status.HTTP_200_OK:
        upstream.close()
        raise _upstream_unavailable(upstream_status)

    try:
        body = upstream.read()
        content_type = _content_type(upstream)
    finally:
        upstream.close()

    return Response(content=body, media_type=content_type, headers={"Cache-Control": "no-store"})


def _worker_url(origin: str, segment: str, camera_id: str) -> str:
    base = origin.strip().rstrip("/")
    if not base:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="worker stream origin is not configured",
        )
    encoded_camera_id = urllib.parse.quote(camera_id, safe="")
    return f"{base}/{segment}/{encoded_camera_id}"


def _stream_url(origin: str, camera_id: str) -> str:
    return _worker_url(origin, "stream", camera_id)


def _snapshot_url(origin: str, camera_id: str) -> str:
    return _worker_url(origin, "snapshot", camera_id)


def _iter_upstream(upstream: _ReadableResponse) -> Iterator[bytes]:
    try:
        while True:
            chunk = upstream.read(_STREAM_CHUNK_SIZE)
            if not chunk:
                break
            yield chunk
    finally:
        upstream.close()


def _content_type(upstream: _ReadableResponse) -> str:
    value = upstream.headers.get("Content-Type")
    if value is not None and value.strip():
        return value
    return _DEFAULT_MEDIA_TYPE


def _authorize(
    request: Request,
    authorization: str | None,
    *,
    query_token: str | None = None,
) -> None:
    expected = getattr(request.app.state, "edge_relay_token", None) or os.environ.get(
        API_EDGE_RELAY_TOKEN_ENV
    )
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="relay token is not configured",
    )
    supplied = _bearer_token(authorization)
    if supplied is None and query_token is not None:
        supplied = query_token
    if supplied is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="bearer token required",
    )
    if not hmac.compare_digest(supplied.encode("utf-8"), expected.encode("utf-8")):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="relay token mismatch")


def _bearer_token(value: str | None) -> str | None:
    if value is None:
        return None
    prefix = "Bearer "
    if not value.startswith(prefix):
        return None
    token = value[len(prefix) :].strip()
    return token or None


def _upstream_unavailable(status_code: int) -> HTTPException:
    if status_code not in {
        status.HTTP_404_NOT_FOUND,
        status.HTTP_503_SERVICE_UNAVAILABLE,
    }:
        status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return HTTPException(status_code=status_code, detail="worker stream unavailable")


__all__ = ["router"]
