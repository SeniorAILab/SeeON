from __future__ import annotations

import pytest

from contracts.observation import BoundingBox, FrameObservation
from domains.bed_exit.detector import BedExitMonitor
from domains.bed_exit.schema import BedExitEvent, BedExitFrame, BedStatus


def box(x1: int, y1: int, x2: int, y2: int, confidence: float = 0.9) -> BoundingBox:
    return BoundingBox(x1=x1, y1=y1, x2=x2, y2=y2, confidence=confidence)


def update(
    monitor: BedExitMonitor,
    beds: tuple[BoundingBox, ...],
    persons: tuple[BoundingBox, ...],
) -> BedExitFrame:
    return monitor.update_boxes(bed_boxes=beds, person_boxes=persons)


def test_schema_exports_bed_exit_frame_statuses_and_events() -> None:
    bed = box(0, 0, 100, 100)
    status = BedStatus(bed_id=0, box=bed, occupancy="exit", person_id=7)
    event = BedExitEvent(person_id=7, bed_id=0)
    assert BedExitFrame(statuses=(status,), events=(event,)).statuses == (status,)


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


def test_invalid_parameters_fail_explicitly() -> None:
    with pytest.raises(ValueError, match="min_containment"):
        BedExitMonitor(min_containment=0.0)
    with pytest.raises(ValueError, match="hold_frames"):
        BedExitMonitor(hold_frames=0)
    with pytest.raises(ValueError, match="grace_frames"):
        BedExitMonitor(grace_frames=-1)


def test_runtime_observation_update_returns_domain_event_tuple() -> None:
    monitor = BedExitMonitor(min_containment=0.5, hold_frames=1, grace_frames=0)
    bed = box(0, 0, 100, 100)

    assert monitor.update(
        FrameObservation(detections=((box(20, 0, 120, 100),), ()), regions=((bed,), ())),
        time_sec=0.0,
    ) == ()

    assert monitor.update(
        FrameObservation(detections=((box(60, 0, 160, 100),), ()), regions=((bed,), ())),
        time_sec=1.0,
    ) == (
        {
            "domain": "bed_exit",
            "event_type": "bed-exit",
            "identity": "0:0",
            "person_id": 0,
            "bed_id": 0,
            "probability": 1.0,
            "time_sec": 1.0,
        },
    )
