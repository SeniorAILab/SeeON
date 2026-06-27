"""Demo Event API publisher.

ML emits typed events. Backend owns severity/channel/policy/final-dedup;
ML runtime incident management owns only idempotency and cooldown.
"""

from __future__ import annotations

import os
import queue
import threading
import urllib.error
import urllib.parse
import urllib.request
from typing import Final

from events.edge_ingest_client import _utc_iso_timestamp
from events.schemas import AlertEventType, EventApiPayload

DEFAULT_QUEUE_SIZE: Final = 8
DEFAULT_TIMEOUT_SEC: Final = 0.5
API_BACKEND_EVENTS_URL_ENV: Final = "API_BACKEND_EVENTS_URL"
DEMO_CAMERA_ID_ENV: Final = "DEMO_CAMERA_ID"
ALERT_EVENT_TYPES: Final[frozenset[str]] = frozenset({"fall", "bed-exit"})


class AlertClient:
    def __init__(
        self,
        *,
        api_url: str,
        source_id: str,
        camera_id: str,
        queue_size: int = DEFAULT_QUEUE_SIZE,
        timeout_sec: float = DEFAULT_TIMEOUT_SEC,
        autostart: bool = True,
    ) -> None:
        self.api_url = _parse_http_url(api_url)
        self.source_id = source_id
        self.camera_id = _parse_required_value(camera_id, "camera_id")
        self.timeout_sec = timeout_sec
        self._queue: queue.Queue[EventApiPayload] = queue.Queue(maxsize=max(1, queue_size))
        self._stop = threading.Event()
        self._lock = threading.Lock()
        self._worker: threading.Thread | None = None
        self._autostart = autostart
        self._failure_count = 0
        self._drop_count = 0

    @classmethod
    def from_env(cls, *, source_id: str) -> AlertClient | None:
        api_url = os.environ.get(API_BACKEND_EVENTS_URL_ENV, "").strip()
        if not api_url:
            return None
        camera_id = os.environ.get(DEMO_CAMERA_ID_ENV, "").strip()
        if not camera_id:
            raise ValueError(
                "Event API configuration missing required environment variable: "
                + DEMO_CAMERA_ID_ENV
            )
        return cls(api_url=api_url, source_id=source_id, camera_id=camera_id)

    @property
    def failure_count(self) -> int:
        with self._lock:
            return self._failure_count

    @property
    def drop_count(self) -> int:
        with self._lock:
            return self._drop_count

    @property
    def pending_count(self) -> int:
        return self._queue.qsize()

    def send(
        self,
        *,
        event_type: AlertEventType,
        detected_at: str | None = None,
        confidence: float | None = None,
        external_event_id: str | None = None,
    ) -> bool:
        del external_event_id
        payload = _parse_payload(
            event_type=event_type,
            camera_id=self.camera_id,
            detected_at=_utc_iso_timestamp() if detected_at is None else detected_at,
            confidence=1.0 if event_type == "bed-exit" and confidence is None else confidence,
        )
        if payload is None:
            self._increment_failure()
            return False
        try:
            self._queue.put_nowait(payload)
        except queue.Full:
            self._increment_drop()
            self._increment_failure()
            return False
        if self._autostart:
            self._ensure_worker()
        return True

    def status_text(self) -> str:
        return (
            f"alert failures {self.failure_count} · drops {self.drop_count} "
            f"· pending {self.pending_count}"
        )

    def flush(self) -> None:
        while True:
            try:
                payload = self._queue.get_nowait()
            except queue.Empty:
                return
            try:
                _post_payload(self.api_url, payload, timeout_sec=self.timeout_sec)
            except (TimeoutError, OSError, urllib.error.URLError, urllib.error.HTTPError):
                self._increment_failure()
            finally:
                self._queue.task_done()

    def close(self) -> None:
        self.flush()
        self._stop.set()
        worker = self._worker
        if worker is not None:
            worker.join(timeout=max(1.0, self.timeout_sec + 0.1))

    def _ensure_worker(self) -> None:
        with self._lock:
            if self._worker is not None:
                return
            self._worker = threading.Thread(target=self._run, name="demo-event-client", daemon=True)
            self._worker.start()

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                payload = self._queue.get(timeout=0.05)
            except queue.Empty:
                continue
            try:
                _post_payload(self.api_url, payload, timeout_sec=self.timeout_sec)
            except (TimeoutError, OSError, urllib.error.URLError, urllib.error.HTTPError):
                self._increment_failure()
            finally:
                self._queue.task_done()

    def _increment_failure(self) -> None:
        with self._lock:
            self._failure_count += 1

    def _increment_drop(self) -> None:
        with self._lock:
            self._drop_count += 1


def _parse_payload(
    *,
    event_type: AlertEventType,
    camera_id: str,
    detected_at: str,
    confidence: float | None,
) -> EventApiPayload | None:
    if event_type not in ALERT_EVENT_TYPES:
        return None
    if camera_id.strip() == "":
        return None
    if detected_at.strip() == "":
        return None
    if confidence is None or not 0.0 <= confidence <= 1.0:
        return None
    return EventApiPayload(
        camera_id=camera_id,
        type=event_type,
        detected_at=detected_at,
        confidence=confidence,
    )


def _parse_required_value(value: str, name: str) -> str:
    stripped = value.strip()
    if stripped == "":
        raise ValueError(f"{name} must be set")
    return stripped


def _parse_http_url(api_url: str) -> str:
    parsed = urllib.parse.urlparse(api_url)
    if parsed.scheme not in {"http", "https"} or parsed.netloc == "":
        raise ValueError(f"Event API URL must be absolute HTTP(S): {api_url}")
    return api_url


def _post_payload(
    api_url: str,
    payload: EventApiPayload,
    *,
    timeout_sec: float,
) -> None:
    request = urllib.request.Request(
        api_url,
        data=payload.as_json_bytes(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout_sec) as response:
        response.read()


__all__ = [
    "ALERT_EVENT_TYPES",
    "API_BACKEND_EVENTS_URL_ENV",
    "DEFAULT_QUEUE_SIZE",
    "DEFAULT_TIMEOUT_SEC",
    "DEMO_CAMERA_ID_ENV",
    "AlertClient",
    "_parse_http_url",
    "_parse_payload",
    "_post_payload",
]
