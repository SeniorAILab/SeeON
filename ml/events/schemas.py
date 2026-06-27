"""Event schemas for ML-emitted events and backend Event API payloads.

ML emits typed events. Backend owns severity/channel/policy/final-dedup;
ML runtime incident management owns only idempotency and cooldown.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Literal, TypeAlias

from contracts.event import DetectionEventType, Level, Severity, front_event_type

AlertEventType: TypeAlias = Literal["fall", "detection-lost", "bed-exit"]
EventLifecycle: TypeAlias = Literal["detected", "updated", "resolved"]


@dataclass(frozen=True, slots=True)
class EventApiPayload:
    camera_id: str
    type: AlertEventType
    detected_at: str
    confidence: float

    def as_dict(self) -> dict[str, str | float]:
        return {
            "camera_id": self.camera_id,
            "type": self.type,
            "detected_at": self.detected_at,
            "confidence": self.confidence,
        }

    def as_json_bytes(self) -> bytes:
        return json.dumps(self.as_dict(), separators=(",", ":")).encode("utf-8")


@dataclass(frozen=True, slots=True)
class EmittedEvent:
    facility: str
    camera: str
    domain: str
    event_type: str
    lifecycle: EventLifecycle
    severity: Severity
    front_event_type: DetectionEventType
    evidence: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "facility": self.facility,
            "camera": self.camera,
            "domain": self.domain,
            "event_type": self.event_type,
            "lifecycle": self.lifecycle,
            "severity": self.severity.value,
            "front_event_type": self.front_event_type.value,
            "evidence": dict(self.evidence),
        }


def build_emitted_event(
    *,
    facility: str,
    camera: str,
    domain: str,
    event_type: str,
    lifecycle: EventLifecycle = "detected",
    severity: Level | str,
    evidence: dict[str, Any] | None = None,
) -> EmittedEvent:
    normalized_event_type = event_type.strip()
    if normalized_event_type == "":
        raise ValueError("event_type must be non-empty")
    return EmittedEvent(
        facility=facility,
        camera=camera,
        domain=domain,
        event_type=normalized_event_type,
        lifecycle=lifecycle,
        severity=Level(severity),
        front_event_type=front_event_type(normalized_event_type),
        evidence={} if evidence is None else dict(evidence),
    )


__all__ = [
    "AlertEventType",
    "EmittedEvent",
    "EventApiPayload",
    "EventLifecycle",
    "build_emitted_event",
]
