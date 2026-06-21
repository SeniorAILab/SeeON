from __future__ import annotations

from domains.bed_exit.schema import BedExitEvent
from domains.fall.detector import FallEventLatch

__all__ = ["BedExitLatch", "DetectionLossMonitor", "FallEventLatch", "render_due"]


def render_due(
    frame_count: int,
    render_stride: int,
    *,
    is_fall: bool,
    last_painted_fall: bool,
) -> bool:
    """Decide whether the UI should repaint for this processed frame."""
    if is_fall != last_painted_fall:
        return True
    return frame_count % max(1, render_stride) == 0


class BedExitLatch:
    """Latch bed-exit events out of the per-frame bed-exit monitor output."""

    def __init__(self) -> None:
        self.event_count: int = 0
        self.first_event_sec: float | None = None
        self._active_exits: set[tuple[int, int]] = set()

    def update(self, events: tuple[BedExitEvent, ...], time_sec: float) -> tuple[BedExitEvent, ...]:
        """Feed one frame's bed-exit events; return newly latched onsets."""
        event_keys = {(event.person_id, event.bed_id) for event in events}
        onset_events = tuple(
            event for event in events if (event.person_id, event.bed_id) not in self._active_exits
        )
        if onset_events:
            self.event_count += len(onset_events)
            if self.first_event_sec is None:
                self.first_event_sec = time_sec
        self._active_exits = event_keys
        return onset_events


class DetectionLossMonitor:
    def __init__(self, *, loss_after_sec: float = 5.0) -> None:
        self._loss_after_sec = loss_after_sec
        self._has_seen_pose = False
        self._zero_pose_since_sec: float | None = None
        self._emitted_for_current_loss = False

    def update(self, *, pose_count: int, time_sec: float) -> bool:
        if pose_count > 0:
            self._has_seen_pose = True
            self._zero_pose_since_sec = None
            self._emitted_for_current_loss = False
            return False
        if not self._has_seen_pose:
            return False
        if self._zero_pose_since_sec is None:
            self._zero_pose_since_sec = time_sec
            return False
        if self._emitted_for_current_loss:
            return False
        if time_sec - self._zero_pose_since_sec < self._loss_after_sec:
            return False
        self._emitted_for_current_loss = True
        return True
