from __future__ import annotations

import threading
import time
from collections.abc import Mapping
from typing import Any

from contracts.decode_diagnostics import DECODE_FALLBACK_REASONS, DecodeSelection
from worker.clip_recorder import ClipRecorderStats


class WorkerDiagnostics:
    """Thread-safe worker telemetry snapshot source.

    Decode state is per camera. Clip recorder state is a single worker aggregate
    because the recorder owns one shared queue and encoder.
    """

    def __init__(self, clip_recorder_stats: ClipRecorderStats | None = None) -> None:
        self._lock = threading.Lock()
        self._decode_by_camera: dict[str, DecodeSelection] = {}
        self._clip_recorder_stats = clip_recorder_stats

    def set_clip_recorder_stats(self, stats: ClipRecorderStats | None) -> None:
        with self._lock:
            self._clip_recorder_stats = stats

    def update_decode(self, camera_id: str, selection: DecodeSelection) -> None:
        with self._lock:
            self._decode_by_camera[camera_id] = selection
    def register_decode(self, camera_id: str, requested: str) -> None:
        with self._lock:
            self._decode_by_camera[camera_id] = DecodeSelection(
                requested=requested,
                selected=None,
                fallback_count=0,
                last_reason=None,
                updated_at_sec=time.time(),
            )

    def record_decode_open_failure(self, camera_id: str, reason: str) -> None:
        if reason not in DECODE_FALLBACK_REASONS:
            reason = "spawn_failed"
        with self._lock:
            previous = self._decode_by_camera.get(camera_id)
            if previous is None:
                return
            self._decode_by_camera[camera_id] = DecodeSelection(
                requested=previous.requested,
                selected=None,
                fallback_count=previous.fallback_count,
                last_reason=reason,
                updated_at_sec=time.time(),
            )

    def decode_selection(self, camera_id: str) -> DecodeSelection | None:
        with self._lock:
            return self._decode_by_camera.get(camera_id)

    def decode_snapshot(self) -> Mapping[str, DecodeSelection]:
        with self._lock:
            return dict(self._decode_by_camera)

    def to_payload(
        self,
        facility_id: str,
        generation: int | None,
        seq: int,
    ) -> dict[str, object]:
        with self._lock:
            selections = dict(self._decode_by_camera)
            stats = self._clip_recorder_stats
        cameras = [
            {"camera_id": camera_id, "decode": _decode_payload(selection)}
            for camera_id, selection in sorted(selections.items())
        ]
        return {
            "facility_id": facility_id,
            "generation": generation,
            "seq": seq,
            "cameras": cameras,
            "clip_recorder": _clip_payload(stats),
        }
    def to_payloads(
        self,
        camera_facilities: Mapping[str, str],
        generation: int | None,
        seq: int,
    ) -> list[dict[str, object]]:
        with self._lock:
            selections = dict(self._decode_by_camera)
            stats = self._clip_recorder_stats
        cameras_by_facility: dict[str, list[dict[str, object]]] = {
            facility_id: [] for facility_id in set(camera_facilities.values())
        }
        for camera_id, selection in selections.items():
            facility_id = camera_facilities.get(camera_id)
            if facility_id is None:
                continue
            cameras_by_facility[facility_id].append(
                {"camera_id": camera_id, "decode": _decode_payload(selection)}
            )
        return [
            {
                "facility_id": facility_id,
                "generation": generation,
                "seq": seq,
                "cameras": sorted(cameras, key=lambda camera: str(camera["camera_id"])),
                "clip_recorder": _clip_payload(stats),
            }
            for facility_id, cameras in sorted(cameras_by_facility.items())
        ]


def _decode_payload(selection: DecodeSelection) -> dict[str, object]:
    return {
        "requested": selection.requested,
        "selected": selection.selected,
        "fallback_count": selection.fallback_count,
        "last_reason": selection.last_reason,
        "updated_at_sec": selection.updated_at_sec,
    }


def _clip_payload(stats: ClipRecorderStats | None) -> dict[str, Any]:
    if stats is None:
        return {
            "available": False,
            "dropped_frames": None,
            "dropped_events": None,
            "failed_writes": None,
            "finalized_clips": None,
            "video_unavailable_clips": None,
            "active_clips": None,
            "encoder": None,
        }
    return {
        "available": True,
        "dropped_frames": stats.dropped_frames,
        "dropped_events": stats.dropped_events,
        "failed_writes": stats.failed_writes,
        "finalized_clips": stats.finalized_clips,
        "video_unavailable_clips": stats.video_unavailable_clips,
        "active_clips": getattr(stats, "active_clips", 0),
        "encoder": getattr(stats, "encoder", None),
    }


__all__ = ["WorkerDiagnostics"]
