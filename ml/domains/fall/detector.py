from __future__ import annotations

from domains.fall.schema import FallEvent


class FallEventLatch:
    """Latch fall events out of the per-frame fall signal."""

    enabled = True

    def __init__(self) -> None:
        self.event_count: int = 0
        self.first_event_sec: float | None = None
        self._prev_fall: bool = False

    def update(self, is_fall: bool, time_sec: float) -> bool:
        """Feed one frame's fall state; return True on a rising edge (new event)."""
        onset = is_fall and not self._prev_fall
        if onset:
            self.event_count += 1
            if self.first_event_sec is None:
                self.first_event_sec = time_sec
        self._prev_fall = is_fall
        return onset

    def update_event(self, is_fall: bool, time_sec: float) -> FallEvent | None:
        """Feed one fall state and return a schema event on a rising edge."""
        if not self.update(is_fall, time_sec):
            return None
        first_event_sec = self.first_event_sec
        if first_event_sec is None:
            first_event_sec = time_sec
        return FallEvent(
            event_count=self.event_count,
            onset_sec=time_sec,
            first_event_sec=first_event_sec,
        )
