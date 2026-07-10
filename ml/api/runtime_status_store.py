"""API-owned worker runtime-status snapshots.

The worker publishes telemetry through the relay HTTP boundary. This store owns
only the API-local, latest snapshot for each facility; it never reads worker
runtime state directly.
"""

from __future__ import annotations

import threading
from collections.abc import Mapping
from copy import deepcopy
from dataclasses import dataclass, field
from time import time
from typing import Any

DEFAULT_RUNTIME_STATUS_STALE_AFTER_SEC: float = 15.0


@dataclass(frozen=True, slots=True)
class RuntimeStatusRecordResult:
    accepted: bool
    generation: int
    reason: str | None = None


@dataclass(frozen=True, slots=True)
class RuntimeStatusSnapshot:
    facility_id: str
    generation: int
    seq: int
    received_at: float
    cameras: tuple[dict[str, Any], ...]
    clip_recorder: dict[str, Any]


@dataclass(slots=True)
class RuntimeStatusStore:
    """Keep one ordered runtime-status snapshot per facility."""

    stale_after_sec: float = DEFAULT_RUNTIME_STATUS_STALE_AFTER_SEC
    _snapshots: dict[str, RuntimeStatusSnapshot] = field(default_factory=dict)
    _latest_generation: dict[str, int] = field(default_factory=dict)
    _lock: threading.Lock = field(default_factory=threading.Lock, init=False, repr=False)

    def record(
        self,
        payload: Mapping[str, object],
        *,
        received_at: float | None = None,
    ) -> RuntimeStatusRecordResult:
        """Record a payload after auth and facility validation.

        A missing generation always starts a new generation. Within a generation
        sequence numbers may repeat for retry delivery, but may not go backwards.
        """
        facility_id = str(payload["facility_id"])
        requested_generation = payload.get("generation")
        seq = int(payload["seq"])
        cameras = payload["cameras"]
        clip_recorder = payload["clip_recorder"]
        if not isinstance(cameras, list) or not isinstance(clip_recorder, dict):
            raise TypeError("runtime status payload has invalid telemetry fields")
        stamped = time() if received_at is None else received_at
        with self._lock:
            previous = self._snapshots.get(facility_id)
            latest_generation = self._latest_generation.get(facility_id, 0)

            if requested_generation is None:
                generation = latest_generation + 1
            else:
                generation = int(requested_generation)
                if generation < latest_generation:
                    return RuntimeStatusRecordResult(False, latest_generation, "old_generation")

            if previous is not None and generation == previous.generation and seq < previous.seq:
                return RuntimeStatusRecordResult(False, previous.generation, "old_seq")

            self._snapshots[facility_id] = RuntimeStatusSnapshot(
                facility_id=facility_id,
                generation=generation,
                seq=seq,
                received_at=stamped,
                cameras=tuple(deepcopy(cameras)),
                clip_recorder=deepcopy(clip_recorder),
            )
            self._latest_generation[facility_id] = max(latest_generation, generation)
            return RuntimeStatusRecordResult(True, generation)

    def snapshot(self, *, now: float | None = None) -> dict[str, Any]:
        """Return API-stamped, facility-keyed telemetry with derived staleness."""
        current = time() if now is None else now
        with self._lock:
            facilities = {
                facility_id: {
                    "facility_id": status.facility_id,
                    "generation": status.generation,
                    "seq": status.seq,
                    "received_at": status.received_at,
                    "stale": current - status.received_at > self.stale_after_sec,
                    "cameras": deepcopy(list(status.cameras)),
                    "clip_recorder": deepcopy(status.clip_recorder),
                }
                for facility_id, status in sorted(self._snapshots.items())
            }
        return {
            "facilities": facilities,
            "stale_after_sec": self.stale_after_sec,
        }


def get_runtime_status_store(app: object) -> RuntimeStatusStore:
    """Return the app-owned runtime store, creating it for no-lifespan tests."""
    state = app.state  # type: ignore[attr-defined]
    store = getattr(state, "runtime_status_store", None)
    if not isinstance(store, RuntimeStatusStore):
        store = RuntimeStatusStore()
        state.runtime_status_store = store
    return store


__all__ = [
    "DEFAULT_RUNTIME_STATUS_STALE_AFTER_SEC",
    "RuntimeStatusRecordResult",
    "RuntimeStatusSnapshot",
    "RuntimeStatusStore",
    "get_runtime_status_store",
]
