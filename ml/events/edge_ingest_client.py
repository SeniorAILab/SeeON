"""Backend Event API HTTP client shared by the API relay and edge worker."""

from __future__ import annotations

import json
import threading
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Final, Protocol

from contracts.event import EventPayload
from contracts.relay import AlertEventType, EventApiPayload

DEFAULT_TIMEOUT_SEC: Final = 0.5


class _PublishedEvent(Protocol):
    event_type: str
    evidence: EventPayload


@dataclass(slots=True)
class EdgeIngestClient:
    events_url: str
    camera_id: str
    timeout_sec: float = DEFAULT_TIMEOUT_SEC
    _failure_count: int = 0
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def __post_init__(self) -> None:
        self.events_url = _parse_http_url(self.events_url)
        self.camera_id = _required(self.camera_id, "camera_id")

    @property
    def failure_count(self) -> int:
        with self._lock:
            return self._failure_count

    def send_heartbeat(self) -> bool:
        return self._post(_join_url(self.events_url, "heartbeat"), {"camera_id": self.camera_id})

    def send_alert(
        self,
        *,
        event_type: AlertEventType,
        detected_at: str,
        probability: float,
    ) -> bool:
        payload = EventApiPayload(
            camera_id=self.camera_id,
            type=event_type,
            detected_at=detected_at,
            confidence=probability,
        )
        return self._post(self.events_url, payload.as_dict())

    def for_camera(self, camera_id: str) -> EdgeIngestClient:
        if camera_id == self.camera_id:
            return self
        return EdgeIngestClient(
            events_url=self.events_url,
            camera_id=camera_id,
            timeout_sec=self.timeout_sec,
        )

    def emit(self, event: EventPayload) -> None:
        event_type = str(event.get("event_type", ""))
        if event_type not in {"fall", "bed-exit"}:
            return
        detected_at = str(event.get("detected_at", ""))
        if detected_at == "":
            detected_at = _utc_iso_timestamp()
        probability = _event_probability(event)
        self.send_alert(
            event_type="bed-exit" if event_type == "bed-exit" else "fall",
            detected_at=detected_at,
            probability=probability,
        )

    def publish(self, event: _PublishedEvent) -> None:
        if event.event_type not in {"fall", "bed-exit"}:
            return
        self.send_alert(
            event_type="bed-exit" if event.event_type == "bed-exit" else "fall",
            detected_at=_utc_iso_timestamp(),
            probability=_event_probability(event.evidence),
        )

    def _post(self, url: str, payload: dict[str, str | float]) -> bool:
        request = urllib.request.Request(
            url,
            data=json.dumps(payload, separators=(",", ":")).encode("utf-8"),
            headers={"Content-Type": "application/json"},
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
        raise ValueError(f"Event API URL must be absolute HTTP(S): {url}")
    return url


def _join_url(base_url: str, child: str) -> str:
    return f"{base_url.rstrip('/')}/{child}"


def _utc_iso_timestamp() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _event_probability(event: EventPayload) -> float:
    value = event.get("probability", event.get("confidence", 1.0))
    if isinstance(value, int | float):
        return min(1.0, max(0.0, float(value)))
    return 1.0


__all__ = ["DEFAULT_TIMEOUT_SEC", "EdgeIngestClient", "_utc_iso_timestamp"]
