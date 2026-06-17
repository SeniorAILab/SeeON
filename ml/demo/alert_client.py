from __future__ import annotations

import datetime as dt
import hashlib
import hmac
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

AlertEventType = Literal["fall", "detection-lost"]

DEFAULT_QUEUE_SIZE: Final = 8
DEFAULT_TIMEOUT_SEC: Final = 0.5
ALERT_API_URL_ENV: Final = "ALERT_API_URL"
INGEST_KEY_ID_ENV: Final = "INGEST_KEY_ID"
INGEST_SECRET_ENV: Final = "INGEST_SECRET"
DEMO_RESIDENT_ID_ENV: Final = "DEMO_RESIDENT_ID"
DEMO_FACILITY_ID_ENV: Final = "DEMO_FACILITY_ID"
ALERT_EVENT_TYPES: Final[frozenset[str]] = frozenset({"fall"})
ISO_TIMESTAMP_RE: Final = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$"
)


@dataclass(frozen=True, slots=True)
class AlertPayload:
    type: AlertEventType
    resident_id: str
    facility_id: str
    detected_at: str
    probability: float

    def as_dict(self) -> dict[str, str | float]:
        return {
            "resident_id": self.resident_id,
            "facility_id": self.facility_id,
            "probability": self.probability,
            "detected_at": self.detected_at,
            "type": self.type,
        }

    def as_json_bytes(self) -> bytes:
        return json.dumps(self.as_dict(), separators=(",", ":")).encode("utf-8")


class AlertClient:
    def __init__(
        self,
        *,
        api_url: str,
        source_id: str,
        ingest_key_id: str,
        ingest_secret: str,
        resident_id: str,
        facility_id: str,
        queue_size: int = DEFAULT_QUEUE_SIZE,
        timeout_sec: float = DEFAULT_TIMEOUT_SEC,
        autostart: bool = True,
    ) -> None:
        self.api_url = _parse_http_url(api_url)
        self.source_id = source_id
        self.timeout_sec = timeout_sec
        self.ingest_key_id = _parse_required_value(ingest_key_id, "ingest_key_id")
        self._signing_key = _derive_hmac_key(ingest_secret)
        self.resident_id = _parse_required_value(resident_id, "resident_id")
        self.facility_id = _parse_required_value(facility_id, "facility_id")
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
        missing = [
            name
            for name in (
                INGEST_KEY_ID_ENV,
                INGEST_SECRET_ENV,
                DEMO_RESIDENT_ID_ENV,
                DEMO_FACILITY_ID_ENV,
            )
            if not os.environ.get(name, "").strip()
        ]
        if missing:
            raise ValueError(
                "Alert ingest configuration missing required environment variables: "
                + ", ".join(missing)
            )
        return cls(
            api_url=api_url,
            source_id=source_id,
            ingest_key_id=os.environ[INGEST_KEY_ID_ENV],
            ingest_secret=os.environ[INGEST_SECRET_ENV],
            resident_id=os.environ[DEMO_RESIDENT_ID_ENV],
            facility_id=os.environ[DEMO_FACILITY_ID_ENV],
        )

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
        del external_event_id
        payload = _parse_payload(
            event_type=event_type,
            resident_id=self.resident_id,
            facility_id=self.facility_id,
            detected_at=detected_at,
            probability=confidence,
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
                    ingest_key_id=self.ingest_key_id,
                    signing_key=self._signing_key,
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
                    ingest_key_id=self.ingest_key_id,
                    signing_key=self._signing_key,
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
    resident_id: str,
    facility_id: str,
    detected_at: str,
    probability: float | None,
) -> AlertPayload | None:
    if event_type not in ALERT_EVENT_TYPES:
        return None
    if resident_id == "":
        return None
    if facility_id == "":
        return None
    if not _is_iso_timestamp(detected_at):
        return None
    if probability is None or not 0.0 <= probability <= 1.0:
        return None
    return AlertPayload(
        type=event_type,
        resident_id=resident_id,
        facility_id=facility_id,
        detected_at=detected_at,
        probability=probability,
    )


def _parse_http_url(api_url: str) -> str:
    parsed = urllib.parse.urlparse(api_url)
    if parsed.scheme not in {"http", "https"} or parsed.netloc == "":
        raise ValueError(f"Alert API URL must be absolute HTTP(S): {api_url}")
    return api_url


def _parse_required_value(value: str, name: str) -> str:
    stripped = value.strip()
    if stripped == "":
        raise ValueError(f"Alert ingest {name} must be set")
    return stripped


def _derive_hmac_key(ingest_secret: str) -> str:
    secret = _parse_required_value(ingest_secret, "ingest_secret")
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


def _is_iso_timestamp(value: str) -> bool:
    return ISO_TIMESTAMP_RE.fullmatch(value) is not None


def _canonical_payload(payload: AlertPayload) -> str:
    return f"{payload.resident_id}|{payload.facility_id}|{payload.type}|{payload.detected_at}"


def _signature(payload: AlertPayload, *, signing_key: str) -> str:
    return hmac.new(
        signing_key.encode("utf-8"),
        _canonical_payload(payload).encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _ingest_timestamp() -> str:
    return dt.datetime.now(dt.UTC).isoformat().replace("+00:00", "Z")


def _post_payload(
    api_url: str,
    payload: AlertPayload,
    *,
    timeout_sec: float,
    ingest_key_id: str,
    signing_key: str,
) -> None:
    headers = {
        "Content-Type": "application/json",
        "X-Ingest-Key-Id": ingest_key_id,
        "X-Ingest-Timestamp": _ingest_timestamp(),
        "X-Signature": _signature(payload, signing_key=signing_key),
    }
    request = urllib.request.Request(
        api_url,
        data=payload.as_json_bytes(),
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout_sec) as response:
        response.read()
