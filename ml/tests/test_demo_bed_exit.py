from __future__ import annotations

import numpy as np
import pytest

from contracts import BoundingBox, DetectionLabel, Frame, FrameObservation
from demo.live_view import iter_live_frames
from domains.bed_exit import BedExitMonitor


def box(x1: int, y1: int, x2: int, y2: int, confidence: float = 0.9) -> BoundingBox:
    return BoundingBox(x1=x1, y1=y1, x2=x2, y2=y2, confidence=confidence)


def update(
    monitor: BedExitMonitor,
    beds: tuple[BoundingBox, ...],
    persons: tuple[BoundingBox, ...],
):
    return monitor.update_boxes(bed_boxes=beds, person_boxes=persons)


def test_no_person_or_no_bed_is_empty_and_no_event() -> None:
    monitor = BedExitMonitor(hold_frames=1, grace_frames=1)

    no_person = update(monitor, (box(0, 0, 100, 100),), ())
    assert [(s.bed_id, s.occupancy, s.person_id) for s in no_person.statuses] == [
        (0, "empty", None)
    ]
    assert no_person.events == ()

    no_bed = update(monitor, (), (box(10, 10, 50, 50),))
    assert no_bed.statuses == ()
    assert no_bed.events == ()


def test_hold_frames_prevent_jitter_assignment_until_stable() -> None:
    beds = (box(0, 0, 100, 100), box(120, 0, 220, 100))
    monitor = BedExitMonitor(min_containment=0.5, hold_frames=2, grace_frames=1)

    first = update(monitor, beds, (box(10, 10, 60, 60),))
    assert [s.occupancy for s in first.statuses] == ["empty", "empty"]

    jitter = update(monitor, beds, (box(130, 10, 180, 60),))
    assert [s.occupancy for s in jitter.statuses] == ["empty", "empty"]

    held_once = update(monitor, beds, (box(130, 10, 180, 60),))
    assert [s.occupancy for s in held_once.statuses] == ["empty", "occupied"]


def test_own_bed_exit_after_grace_emits_once_and_unassigns() -> None:
    beds = (box(0, 0, 100, 100),)
    monitor = BedExitMonitor(min_containment=0.5, hold_frames=1, grace_frames=1)

    assigned = update(monitor, beds, (box(50, 10, 110, 50),))
    assert assigned.statuses[0].occupancy == "occupied"

    grace = update(monitor, beds, (box(75, 10, 135, 50),))
    assert grace.statuses[0].occupancy == "empty"
    assert grace.events == ()

    exited = update(monitor, beds, (box(90, 10, 150, 50),))
    assert [(e.person_id, e.bed_id) for e in exited.events] == [(0, 0)]
    assert exited.statuses[0].occupancy == "exit"

    after = update(monitor, beds, (box(90, 10, 150, 50),))
    assert after.events == ()


def test_cross_bed_movement_does_not_false_positive_own_bed_exit() -> None:
    beds = (box(0, 0, 100, 100), box(80, 0, 180, 100))
    monitor = BedExitMonitor(min_containment=0.5, hold_frames=1, grace_frames=0)

    update(monitor, beds, (box(50, 10, 110, 70),))
    moved_to_other_bed = update(monitor, beds, (box(75, 10, 135, 70),))

    assert moved_to_other_bed.events == ()
    assert [s.occupancy for s in moved_to_other_bed.statuses] == ["empty", "empty"]


def test_overlapping_beds_choose_best_containment_with_lowest_id_tiebreak() -> None:
    beds = (box(0, 0, 100, 100), box(20, 0, 120, 100))
    monitor = BedExitMonitor(min_containment=0.5, hold_frames=1)

    tied = update(monitor, beds, (box(20, 10, 100, 90),))

    assert [(s.bed_id, s.occupancy) for s in tied.statuses] == [
        (0, "occupied"),
        (1, "empty"),
    ]


def test_deterministic_id_follows_detect_beds_order_and_supports_max_cap() -> None:
    beds = tuple(box(i * 100, 0, i * 100 + 80, 80) for i in range(4))
    monitor = BedExitMonitor(min_containment=0.5, hold_frames=1)

    state = update(monitor, beds, (box(210, 10, 250, 50),))

    assert [s.bed_id for s in state.statuses] == [0, 1, 2, 3]
    assert [s.occupancy for s in state.statuses] == ["empty", "empty", "occupied", "empty"]


def test_iter_live_frames_runs_bed_detector_once_and_carries_cached_beds() -> None:
    frames = (
        Frame(index=0, time_sec=0.0, image=np.zeros((8, 8, 3), dtype=np.uint8)),
        Frame(index=1, time_sec=0.1, image=np.zeros((8, 8, 3), dtype=np.uint8)),
    )
    bed = box(0, 0, 4, 4)

    class FakeDetector:
        calls = 0

        def detect(self, frame: Frame) -> tuple[BoundingBox, ...]:
            self.calls += 1
            return (bed,)

    class FakeModel:
        def predict(self, frame: Frame) -> FrameObservation:
            person = box(0, 0, 4, 4)
            return FrameObservation(
                detections=(
                    (person,),
                    (DetectionLabel(text="person", confidence=0.8, is_fall=False),),
                ),
                poses=(),
                regions=((), ()),
            )

    detector = FakeDetector()
    outputs = tuple(iter_live_frames(frames, FakeModel(), bed_detector=detector))

    assert detector.calls == 1
    assert len(outputs) == 2
    assert [status.pose_count for _overlay, status, _confidence in outputs] == [0, 0]


def test_invalid_parameters_fail_explicitly() -> None:
    with pytest.raises(ValueError, match="min_containment"):
        BedExitMonitor(min_containment=0.0)
    with pytest.raises(ValueError, match="hold_frames"):
        BedExitMonitor(hold_frames=0)
    with pytest.raises(ValueError, match="grace_frames"):
        BedExitMonitor(grace_frames=-1)
