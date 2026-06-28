"""Backend relay payload primitives shared across API and events clients."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Literal, TypeAlias

AlertEventType: TypeAlias = Literal["fall", "detection-lost", "bed-exit"]
RelayAlertPayload: TypeAlias = dict[str, str | float]
RelayHeartbeatPayload: TypeAlias = dict[str, str]


@dataclass(frozen=True, slots=True)
class EventApiPayload:
    camera_id: str
    type: AlertEventType
    detected_at: str
    confidence: float

    def as_dict(self) -> RelayAlertPayload:
        return {
            "camera_id": self.camera_id,
            "type": self.type,
            "detected_at": self.detected_at,
            "confidence": self.confidence,
        }

    def as_json_bytes(self) -> bytes:
        return json.dumps(self.as_dict(), separators=(",", ":")).encode("utf-8")


__all__ = [
    "AlertEventType",
    "EventApiPayload",
    "RelayAlertPayload",
    "RelayHeartbeatPayload",
]
