"""Backend ingest HTTP client shared by the API relay and edge worker."""
from __future__ import annotations

import hashlib
import hmac
import threading
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from typing import Final

from contracts.event import EventPayload
from events.schemas import AlertEventType, AlertPayload, EmittedEvent
from events.signing import _derive_hmac_key, _ingest_timestamp

DEFAULT_TIMEOUT_SEC: Final = 0.5


@dataclass(slots=True)
class EdgeIngestClient:
    alert_url: str
    heartbeat_url: str
    camera_id: str
    facility_id: str
    resident_id: str | None
    ingest_key_id: str
    ingest_secret: str
    timeout_sec: float = DEFAULT_TIMEOUT_SEC
    _failure_count: int = 0
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)
    _signing_key: str = field(init=False, repr=False)

    def __post_init__(self) -> None:
        self.alert_url = _parse_http_url(self.alert_url)
        self.heartbeat_url = _parse_http_url(self.heartbeat_url)
        self.ingest_key_id = _required(self.ingest_key_id, "ingest_key_id")
        self._signing_key = _derive_hmac_key(self.ingest_secret)

    @property
    def failure_count(self) -> int:
        with self._lock:
            return self._failure_count

    def send_heartbeat(self) -> bool:
        return self._post(self.heartbeat_url, None)

    def send_alert(
        self,
        *,
        event_type: AlertEventType,
        detected_at: str,
        probability: float,
        facility_id: str | None = None,
        resident_id: str | None = None,
    ) -> bool:
        resolved_resident_id = self.resident_id if resident_id is None else resident_id
        resolved_facility_id = self.facility_id if facility_id is None else facility_id
        if resolved_resident_id is None:
            self._increment_failure()
            return False
        payload = AlertPayload(
            type=event_type,
            resident_id=resolved_resident_id,
            facility_id=resolved_facility_id,
            detected_at=detected_at,
            probability=probability,
        )
        return self._post(self.alert_url, payload)

    def emit(self, event: EventPayload) -> None:
        event_type = str(event.get("event_type", ""))
        if event_type not in {"fall", "bed-exit"}:
            return
        detected_at = str(event.get("detected_at", ""))
        if detected_at == "":
            detected_at = _ingest_timestamp()
        probability = _event_probability(event)
        self.send_alert(
            event_type="bed-exit" if event_type == "bed-exit" else "fall",
            detected_at=detected_at,
            probability=probability,
        )

    def publish(self, event: EmittedEvent) -> None:
        if event.event_type not in {"fall", "bed-exit"}:
            return
        self.send_alert(
            event_type="bed-exit" if event.event_type == "bed-exit" else "fall",
            detected_at=_ingest_timestamp(),
            probability=_event_probability(event.evidence),
        )

    def _post(self, url: str, payload: AlertPayload | None) -> bool:
        data = None if payload is None else payload.as_json_bytes()
        request = urllib.request.Request(
            url,
            data=data,
            headers={
                "Content-Type": "application/json",
                "X-Ingest-Key-Id": self.ingest_key_id,
                "X-Ingest-Timestamp": _ingest_timestamp(),
                "X-Signature": _signature(payload, signing_key=self._signing_key),
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout_sec) as response:
                response.read()
        except (TimeoutError, OSError, urllib.error.URLError, urllib.error.HTTPError):
            self._increment_failure()
            return False
        return True

    def _increment_failure(self) -> None:
        with self._lock:
            self._failure_count += 1


def _required(value: str, name: str) -> str:
    stripped = value.strip()
    if stripped == "":
        raise ValueError(f"{name} must be set")
    return stripped


def _parse_http_url(url: str) -> str:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in {"http", "https"} or parsed.netloc == "":
        raise ValueError(f"ingest URL must be absolute HTTP(S): {url}")
    return url


def _signature(payload: AlertPayload | None, *, signing_key: str) -> str:
    canonical = "|||" if payload is None else _canonical_payload(payload)
    return hmac.new(
        signing_key.encode("utf-8"),
        canonical.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _canonical_payload(payload: AlertPayload) -> str:
    return f"{payload.resident_id}|{payload.facility_id}|{payload.type}|{payload.detected_at}"


def _event_probability(event: EventPayload) -> float:
    value = event.get("probability", event.get("confidence", 1.0))
    if isinstance(value, int | float):
        return min(1.0, max(0.0, float(value)))
    return 1.0


__all__ = ["DEFAULT_TIMEOUT_SEC", "EdgeIngestClient"]
