from __future__ import annotations

import json
import os
import queue
import re
import threading
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Final, Literal
from uuid import uuid4

AlertEventType = Literal["fall", "detection-lost"]

DEFAULT_QUEUE_SIZE: Final = 8
DEFAULT_TIMEOUT_SEC: Final = 0.5
ALERT_API_URL_ENV: Final = "ALERT_API_URL"
ALERT_EVENTS_API_KEY_ENV: Final = "ALERT_EVENTS_API_KEY"
ALERT_EVENT_TYPES: Final[frozenset[str]] = frozenset({"fall", "detection-lost"})
ISO_TIMESTAMP_RE: Final = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$"
)


@dataclass(frozen=True, slots=True)
class AlertPayload:
    type: AlertEventType
    source_id: str
    external_event_id: str
    detected_at: str
    confidence: float | None = None

    def as_json_bytes(self) -> bytes:
        payload: dict[str, str | float] = {
            "type": self.type,
            "source_id": self.source_id,
            "external_event_id": self.external_event_id,
            "detected_at": self.detected_at,
        }
        if self.confidence is not None:
            payload["confidence"] = self.confidence
        return json.dumps(payload, separators=(",", ":")).encode("utf-8")


class AlertClient:
    def __init__(
        self,
        *,
        api_url: str,
        source_id: str,
        queue_size: int = DEFAULT_QUEUE_SIZE,
        timeout_sec: float = DEFAULT_TIMEOUT_SEC,
        api_key: str | None = None,
        autostart: bool = True,
    ) -> None:
        self.api_url = _parse_http_url(api_url)
        self.source_id = source_id
        self.timeout_sec = timeout_sec
        self.api_key = _parse_api_key(api_key)
        self._queue: queue.Queue[AlertPayload] = queue.Queue(maxsize=max(1, queue_size))
        self._stop = threading.Event()
        self._lock = threading.Lock()
        self._worker: threading.Thread | None = None
        self._autostart = autostart
        self._failure_count = 0
        self._drop_count = 0

    @classmethod
    def from_env(cls, *, source_id: str) -> AlertClient | None:
        api_url = os.environ.get(ALERT_API_URL_ENV, "").strip()
        if not api_url:
            return None
        api_key = os.environ.get(ALERT_EVENTS_API_KEY_ENV)
        return cls(api_url=api_url, source_id=source_id, api_key=api_key)

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
        detected_at: str,
        confidence: float | None = None,
        external_event_id: str | None = None,
    ) -> bool:
        payload = _parse_payload(
            event_type=event_type,
            source_id=self.source_id,
            external_event_id=external_event_id or uuid4().hex,
            detected_at=detected_at,
            confidence=confidence,
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
                _post_payload(
                    self.api_url,
                    payload,
                    timeout_sec=self.timeout_sec,
                    api_key=self.api_key,
                )
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
            self._worker = threading.Thread(target=self._run, name="demo-alert-client", daemon=True)
            self._worker.start()

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                payload = self._queue.get(timeout=0.05)
            except queue.Empty:
                continue
            try:
                _post_payload(
                    self.api_url,
                    payload,
                    timeout_sec=self.timeout_sec,
                    api_key=self.api_key,
                )
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
    source_id: str,
    external_event_id: str,
    detected_at: str,
    confidence: float | None,
) -> AlertPayload | None:
    if event_type not in ALERT_EVENT_TYPES:
        return None
    if source_id == "":
        return None
    if external_event_id == "":
        return None
    if not _is_iso_timestamp(detected_at):
        return None
    if confidence is not None and not 0.0 <= confidence <= 1.0:
        return None
    return AlertPayload(
        type=event_type,
        source_id=source_id,
        external_event_id=external_event_id,
        detected_at=detected_at,
        confidence=confidence,
    )


def _parse_http_url(api_url: str) -> str:
    parsed = urllib.parse.urlparse(api_url)
    if parsed.scheme not in {"http", "https"} or parsed.netloc == "":
        raise ValueError(f"Alert API URL must be absolute HTTP(S): {api_url}")
    return api_url


def _parse_api_key(api_key: str | None) -> str | None:
    if api_key is None:
        return None
    stripped = api_key.strip()
    if stripped == "":
        return None
    return stripped


def _is_iso_timestamp(value: str) -> bool:
    return ISO_TIMESTAMP_RE.fullmatch(value) is not None


def _post_payload(
    api_url: str,
    payload: AlertPayload,
    *,
    timeout_sec: float,
    api_key: str | None,
) -> None:
    headers = {"Content-Type": "application/json"}
    if api_key is not None:
        headers["x-alert-api-key"] = api_key
    request = urllib.request.Request(
        api_url,
        data=payload.as_json_bytes(),
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout_sec) as response:
        response.read()
