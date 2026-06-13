"""Rising-edge latch for bed-exit events (issue #100, G004).

Mirrors ``FallEventLatch`` in ``demo/live_view.py``: the per-frame bed-exit
signal honestly drops back to NORMAL once the person is re-confirmed in bed (or
the alert clears), but the "a bed-exit happened" fact should persist on screen.
This latch detects rising edges (정상→이탈) and remembers the first onset time
and total onset count so the page can keep a latched badge.

Pure aggregation of real inference outputs — it never invents an exit
(ADR-005 §5). Product-grade alerting (ack flow, KakaoTalk notifications) is
backend scope (ADR-003), out of demo scope.

Kept in its own module (not folded into live_view.py) so the bed-exit page
composes it without importing the fall viewer's pipeline (G006 keeps
iter_live_frames / live_camera.py untouched).
"""

from __future__ import annotations


class BedExitLatch:
    """Latch bed-exit *events* out of the per-frame bed-exit signal."""

    def __init__(self) -> None:
        self.event_count: int = 0
        self.first_event_sec: float | None = None
        self._prev_exit: bool = False

    def update(self, is_bed_exit: bool, time_sec: float) -> bool:
        """Feed one frame's bed-exit state; return True on a rising edge (new event)."""
        onset = is_bed_exit and not self._prev_exit
        if onset:
            self.event_count += 1
            if self.first_event_sec is None:
                self.first_event_sec = time_sec
        self._prev_exit = is_bed_exit
        return onset
