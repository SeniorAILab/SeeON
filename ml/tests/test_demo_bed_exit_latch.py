"""BedExitLatch rising-edge aggregation (issue #100, G004).

Mirrors TestFallEventLatch: no event without an onset, a single sustained exit
counts once and records its first time, re-entry then a second exit counts a new
event while keeping the first time, and an exit on the very first frame is an
onset.
"""

from __future__ import annotations

from demo.bed_exit_latch import BedExitLatch


def test_no_exit_no_event() -> None:
    latch = BedExitLatch()
    assert not any(latch.update(False, t * 0.1) for t in range(10))
    assert latch.event_count == 0
    assert latch.first_event_sec is None


def test_single_onset_records_time_and_counts_once() -> None:
    latch = BedExitLatch()
    signal = [False, False, True, True, True, False]
    onsets = [latch.update(s, i * 0.5) for i, s in enumerate(signal)]
    assert onsets == [False, False, True, False, False, False]
    assert latch.event_count == 1
    assert latch.first_event_sec == 1.0


def test_reentry_counts_new_event_keeps_first_time() -> None:
    latch = BedExitLatch()
    signal = [False, True, False, False, True, True]
    for i, s in enumerate(signal):
        latch.update(s, float(i))
    assert latch.event_count == 2
    assert latch.first_event_sec == 1.0


def test_exit_on_first_frame_is_an_onset() -> None:
    latch = BedExitLatch()
    assert latch.update(True, 0.0) is True
    assert latch.first_event_sec == 0.0
