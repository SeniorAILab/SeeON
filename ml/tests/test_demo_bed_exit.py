"""Bed-exit logic units (issue #100, AC-15).

Covers the pure containment math, the BedExitTracker dwell/hysteresis state
machine (arming, sustained exit, debounce, occlusion freeze, eviction, re-arm),
and the BedExitModule composition (no-bed graceful path, single-person exit,
multi-person independence). No model, no cv2 — the pose module is a scripted
stub so the logic is exercised in isolation.
"""

from __future__ import annotations

import numpy as np

from demo.bed_exit import (
    BED_EXIT_LABEL_TEXT,
    BedExitModule,
    BedExitParams,
    BedExitTracker,
    containment,
)
from demo.seam import (
    NORMAL_LABEL_TEXT,
    BoundingBox,
    DetectionResult,
    Frame,
)

BED = BoundingBox(x1=0, y1=0, x2=100, y2=100, confidence=0.9)


def _box(x1: int, y1: int, x2: int, y2: int) -> BoundingBox:
    return BoundingBox(x1=x1, y1=y1, x2=x2, y2=y2, confidence=0.9)


# --------------------------------------------------------------------------- #
# containment
# --------------------------------------------------------------------------- #


def test_containment_fully_inside_is_one() -> None:
    assert containment(_box(10, 10, 50, 50), BED) == 1.0


def test_containment_fully_outside_is_zero() -> None:
    assert containment(_box(200, 200, 260, 260), BED) == 0.0


def test_containment_half_overlap() -> None:
    # Person spans x in [50, 150]; only [50, 100] is inside the bed → half.
    assert containment(_box(50, 0, 150, 100), BED) == 0.5


def test_containment_zero_area_person_is_zero() -> None:
    assert containment(_box(10, 10, 10, 80), BED) == 0.0


# --------------------------------------------------------------------------- #
# BedExitTracker — dwell + hysteresis state machine
# --------------------------------------------------------------------------- #

# Tight params so a few synthetic frames cross the dwell windows.
P = BedExitParams(
    bed_in_threshold=0.5,
    bed_exit_threshold=0.1,
    bed_in_dwell_sec=0.5,
    bed_exit_dwell_sec=1.0,
)


def _drive(tracker: BedExitTracker, samples: list[tuple[float, float]]) -> list[bool]:
    """Feed (time_sec, containment) for a single track id; return exited flag each step."""
    out: list[bool] = []
    for t, ratio in samples:
        exited = tracker.update({0: ratio}, t, frozenset({0}))
        out.append(0 in exited)
    return out


def test_arming_requires_sustained_in_bed_dwell() -> None:
    tracker = BedExitTracker(P)
    # In bed but not yet for the full in-dwell → cannot have exited, not armed.
    flags = _drive(tracker, [(0.0, 0.9), (0.3, 0.9)])
    assert flags == [False, False]


def test_full_in_then_out_fires_after_exit_dwell() -> None:
    tracker = BedExitTracker(P)
    flags = _drive(
        tracker,
        [
            (0.0, 0.9),  # arming starts
            (0.6, 0.9),  # >= 0.5s in-dwell → confirmed in bed
            (1.0, 0.0),  # out starts
            (1.5, 0.0),  # 0.5s out < 1.0s exit-dwell → not yet
            (2.1, 0.0),  # >= 1.0s sustained out → BED_EXIT
        ],
    )
    assert flags == [False, False, False, False, True]


def test_brief_dip_below_exit_threshold_does_not_fire() -> None:
    tracker = BedExitTracker(P)
    flags = _drive(
        tracker,
        [
            (0.0, 0.9),
            (0.6, 0.9),  # confirmed in bed
            (1.0, 0.0),  # out starts
            (1.3, 0.9),  # back in bed before exit-dwell → resets
            (1.6, 0.9),
        ],
    )
    assert not any(flags)


def test_hysteresis_band_holds_in_bed_state() -> None:
    tracker = BedExitTracker(P)
    flags = _drive(
        tracker,
        [
            (0.0, 0.9),
            (0.6, 0.9),  # confirmed in bed
            (1.0, 0.3),  # in [0.1, 0.5) band — not below exit threshold
            (3.0, 0.3),  # held a long time, still must not fire
        ],
    )
    assert not any(flags)


def test_occluded_track_state_frozen_no_false_exit() -> None:
    tracker = BedExitTracker(P)
    tracker.update({0: 0.9}, 0.0, frozenset({0}))
    tracker.update({0: 0.9}, 0.6, frozenset({0}))  # confirmed in bed
    # Track stays live but is NOT detected this frame (occluded): no containment
    # entry. It must not advance to exited on fabricated data.
    for t in (1.0, 2.5, 4.0):
        exited = tracker.update({}, t, frozenset({0}))
        assert 0 not in exited


def test_evicted_track_state_dropped() -> None:
    tracker = BedExitTracker(P)
    tracker.update({0: 0.9}, 0.0, frozenset({0}))
    # id 0 no longer live → its state is pruned, returns no exited ids.
    assert tracker.update({}, 0.5, frozenset()) == frozenset()


def test_reentry_required_after_exit_before_next_alert() -> None:
    tracker = BedExitTracker(P)
    # First exit.
    _drive(tracker, [(0.0, 0.9), (0.6, 0.9), (1.0, 0.0), (2.1, 0.0)])
    # Still out — remains exited (sustained level), but a NEW exit needs re-entry.
    exited_again = tracker.update({0: 0.0}, 2.5, frozenset({0}))
    assert 0 in exited_again  # level stays high while out
    # Re-enter bed → alert clears after in-dwell.
    tracker.update({0: 0.9}, 3.0, frozenset({0}))
    cleared = tracker.update({0: 0.9}, 3.6, frozenset({0}))
    assert 0 not in cleared


# --------------------------------------------------------------------------- #
# BedExitModule — composition over a scripted pose stub
# --------------------------------------------------------------------------- #


class _ScriptedPose:
    """Pose ModelModule stub yielding pre-scripted person boxes per frame."""

    def __init__(self, boxes_per_frame: list[tuple[BoundingBox, ...]]) -> None:
        self._frames = boxes_per_frame
        self._i = 0

    def predict(self, frame: Frame) -> DetectionResult:
        boxes = self._frames[self._i]
        self._i += 1
        return DetectionResult(boxes=boxes, keypoints=tuple(() for _ in boxes))


def _frame(t: float) -> Frame:
    return Frame(index=int(t * 10), time_sec=t, image=np.zeros((4, 4, 3), dtype=np.uint8))


# A 50px-wide person box sliding right out of BED. Steps of 20px keep
# consecutive-frame IoU ≥ 0.3 so GreedyIouTracker preserves the track id
# through the whole exit — mirroring a real person who moves continuously
# rather than teleporting. (time_sec, x-origin); box = [x, 10, x+50, 60].
#   x=0..40   → fully in bed (containment 1.0)
#   x=60,80   → partially out (0.8, 0.4)
#   x≥100     → fully out (containment 0.0)
_A_SLIDE_OUT: list[tuple[float, int]] = [
    (0.0, 0),
    (0.6, 0),  # ≥0.5s in-dwell → confirmed in bed
    (0.8, 20),
    (1.0, 40),
    (1.2, 60),
    (1.4, 80),
    (1.6, 100),  # containment 0.0 → out-dwell starts
    (1.8, 120),
    (2.7, 120),  # ≥1.0s sustained out → BED_EXIT
]


def _a_box(x: int) -> BoundingBox:
    return _box(x, 10, x + 50, 60)


def test_module_no_bed_is_graceful_normal() -> None:
    pose = _ScriptedPose([(_box(200, 200, 260, 260),)])
    module = BedExitModule(pose_module=pose, bed_box=None, params=P)

    result = module.predict(_frame(0.0))

    assert result.bed_box is None
    assert len(result.labels) == 1
    assert result.labels[0].text == NORMAL_LABEL_TEXT
    assert result.labels[0].is_fall is False


def test_module_emits_bed_exit_label_after_transition() -> None:
    pose = _ScriptedPose([(_a_box(x),) for _, x in _A_SLIDE_OUT])
    module = BedExitModule(pose_module=pose, bed_box=BED, params=P)

    texts = [module.predict(_frame(t)).labels[0].text for t, _ in _A_SLIDE_OUT]

    # Starts NORMAL while in bed, ends BED_EXIT once sustained-out fires.
    assert texts[0] == NORMAL_LABEL_TEXT
    assert texts[1] == NORMAL_LABEL_TEXT
    assert texts[-1] == BED_EXIT_LABEL_TEXT


def test_module_carries_bed_box_through() -> None:
    pose = _ScriptedPose([(_box(10, 10, 60, 60),)])
    module = BedExitModule(pose_module=pose, bed_box=BED, params=P)
    assert module.predict(_frame(0.0)).bed_box == BED


def test_module_multi_person_independent() -> None:
    # Person A leaves the bed (sliding out); person B (caregiver) stays far below
    # the bed the whole time and must never be flagged BED_EXIT — never confirmed
    # in bed. B is stationary, so its track id is trivially preserved.
    b = _box(10, 200, 60, 260)  # always far below the bed (containment 0)
    pose = _ScriptedPose([(_a_box(x), b) for _, x in _A_SLIDE_OUT])
    module = BedExitModule(pose_module=pose, bed_box=BED, params=P)

    last = None
    for t, _ in _A_SLIDE_OUT:
        last = module.predict(_frame(t))

    assert last is not None
    # Exactly one BED_EXIT (person A); person B stays NORMAL throughout.
    assert sum(lbl.text == BED_EXIT_LABEL_TEXT for lbl in last.labels) == 1
    assert sum(lbl.text == NORMAL_LABEL_TEXT for lbl in last.labels) == 1
