"""Bed-exit detection logic for the eldercare demo (issue #100).

The alert criterion (locked decision 2, see the bed-exit ADR): a person who was
**confirmed in bed** and then leaves it. "In bed" / "left" are decided by the
*containment ratio* ``area(person ∩ bed) / area(person)`` — robust to the
person box being larger than the bed and to oblique camera angles, unlike raw
IoU. Two dwell timers debounce the transition so sitting up, leaning over the
edge, or a one-frame detector wobble do not fire:

    arming   : containment ≥ bed_in_threshold   sustained ``bed_in_dwell_sec``  → confirmed in bed
    alerting : containment < bed_exit_threshold  sustained ``bed_exit_dwell_sec`` → BED_EXIT

The gap between the two thresholds (0.5 vs 0.1) is deliberate hysteresis: the
band [0.1, 0.5) holds the current state rather than flapping.

Multi-person: each person is followed by the existing ``GreedyIouTracker`` and
gets an independent state machine keyed by track id (locked decision 2). A
caregiver entering the frame is simply another track and never confirmed "in
bed" unless they actually lie on it.

Anti-fabrication (ADR-005 §5): a live-but-undetected (occluded) track keeps its
state frozen — we never invent a containment of 0 for a missing person, which
would otherwise manufacture a false bed-exit. Brief occlusion is absorbed by
the tracker's miss TTL; a true exit is detected once the person is visible off
the bed.

No bed (``bed_box is None``) is the graceful normal state (locked decision 4):
every track stays NORMAL, no state machine runs.

This module is pure Python (no numpy / cv2 / ultralytics) below ``BedExitModule``
so the logic is unit-testable in isolation, mirroring ``demo/tracking.py``.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from demo.seam import (
    NORMAL_LABEL_TEXT,
    BoundingBox,
    DetectionLabel,
    DetectionResult,
    Frame,
    ModelModule,
)
from demo.tracking import GreedyIouTracker

# New vocabulary for this feature; kept here (not in seam.py) so the bed-exit
# label set stays scoped to the page/latch/overlay that consume it.
BED_EXIT_LABEL_TEXT: Final = "BED_EXIT"


def containment(person: BoundingBox, bed: BoundingBox) -> float:
    """Fraction of the *person* box that lies inside the *bed* box, in [0, 1].

    Returns 0.0 when the person box has zero area (degenerate detection) — a
    zero-area person is treated as "not in bed", never a divide-by-zero.
    """
    person_area = max(0, person.x2 - person.x1) * max(0, person.y2 - person.y1)
    if person_area == 0:
        return 0.0
    inter_x1 = max(person.x1, bed.x1)
    inter_y1 = max(person.y1, bed.y1)
    inter_x2 = min(person.x2, bed.x2)
    inter_y2 = min(person.y2, bed.y2)
    inter_area = max(0, inter_x2 - inter_x1) * max(0, inter_y2 - inter_y1)
    return inter_area / person_area


@dataclass(frozen=True, slots=True)
class BedExitParams:
    """Tunable thresholds for the bed-exit state machine.

    Defaults come from the bed-exit research/ADR. ``bed_in_threshold`` >
    ``bed_exit_threshold`` gives hysteresis; the two dwell times debounce the
    arming and the alert independently.
    """

    bed_in_threshold: float = 0.5
    bed_exit_threshold: float = 0.1
    bed_in_dwell_sec: float = 0.5
    bed_exit_dwell_sec: float = 1.0


@dataclass
class _TrackState:
    confirmed_in_bed: bool = False
    exited: bool = False
    in_since: float | None = None
    out_since: float | None = None


class BedExitTracker:
    """Per-track in-bed→out transition detector driven by containment + time.

    Pure and deterministic: feed it ``{track_id: containment}`` plus the frame
    timestamp and the set of live track ids, and it returns the set of tracks
    currently in the *exited* (alerting) state. The ``exited`` flag is a
    sustained level (not a one-shot pulse) so the rising-edge latch (G004) owns
    event counting.
    """

    def __init__(self, params: BedExitParams | None = None) -> None:
        self._params = params if params is not None else BedExitParams()
        self._states: dict[int, _TrackState] = {}

    @property
    def params(self) -> BedExitParams:
        return self._params

    def update(
        self,
        containment_by_id: dict[int, float],
        time_sec: float,
        live_ids: frozenset[int],
    ) -> frozenset[int]:
        """Advance every detected track's state machine; return exited track ids.

        ``containment_by_id`` holds only tracks actually detected this frame.
        Live-but-undetected tracks (occluded) are left frozen — never stepped on
        fabricated data. States for evicted tracks (not in ``live_ids``) are
        dropped.
        """
        # --- evict states for tracks the tracker no longer considers live ---
        for tid in set(self._states) - live_ids:
            del self._states[tid]

        # --- step only tracks with a real detection this frame ---
        for tid, ratio in containment_by_id.items():
            state = self._states.get(tid)
            if state is None:
                state = _TrackState()
                self._states[tid] = state
            self._step(state, ratio, time_sec)

        return frozenset(tid for tid, s in self._states.items() if s.exited)

    def _step(self, state: _TrackState, ratio: float, time_sec: float) -> None:
        p = self._params
        if not state.confirmed_in_bed:
            # Arming: require containment sustained at/above the in-threshold.
            if ratio >= p.bed_in_threshold:
                if state.in_since is None:
                    state.in_since = time_sec
                if time_sec - state.in_since >= p.bed_in_dwell_sec:
                    state.confirmed_in_bed = True
                    state.exited = False
                    state.out_since = None
            else:
                state.in_since = None
        else:
            # Confirmed in bed: watch for containment sustained below exit-threshold.
            if ratio < p.bed_exit_threshold:
                if state.out_since is None:
                    state.out_since = time_sec
                if time_sec - state.out_since >= p.bed_exit_dwell_sec:
                    state.exited = True
                    # Require a fresh re-entry before another exit can fire.
                    state.confirmed_in_bed = False
                    state.in_since = None
            else:
                state.out_since = None


class BedExitModule:
    """ModelModule that flags people who have left a (cached) static bed ROI.

    Composition mirrors ``TemporalFallClassifierModule``: a pose ``ModelModule``
    supplies per-frame person boxes/keypoints in a single pass, a
    ``GreedyIouTracker`` assigns stable ids, and a ``BedExitTracker`` holds the
    per-track transition logic. The bed ROI is detected once upstream (the page
    does the one-shot ``BedDetector`` call) and passed in as ``bed_box`` — this
    module never runs bed inference, so the per-frame path stays a single pose
    pass (ADR-005 §3).

    Emits one ``DetectionLabel`` per person: ``BED_EXIT`` (``is_fall=False`` —
    bed-exit is a distinct alert class, not a fall) for exited tracks, otherwise
    ``NORMAL``. ``bed_box`` is carried through on every result for the overlay.
    """

    def __init__(
        self,
        pose_module: ModelModule,
        bed_box: BoundingBox | None,
        params: BedExitParams | None = None,
    ) -> None:
        self._pose = pose_module
        self._bed_box = bed_box
        self._tracker = GreedyIouTracker()
        self._exit_tracker = BedExitTracker(params)

    def predict(self, frame: Frame) -> DetectionResult:
        pose = self._pose.predict(frame)

        # No bed → graceful normal state: pass poses through, all NORMAL.
        if self._bed_box is None:
            labels = tuple(_normal_label() for _ in pose.boxes)
            return DetectionResult(
                boxes=pose.boxes, labels=labels, keypoints=pose.keypoints, bed_box=None
            )

        track_ids = self._tracker.update(pose.boxes)
        containment_by_id = {
            tid: containment(box, self._bed_box)
            for tid, box in zip(track_ids, pose.boxes, strict=True)
        }
        exited_ids = self._exit_tracker.update(
            containment_by_id, frame.time_sec, self._tracker.live_ids
        )

        labels = tuple(
            _bed_exit_label() if tid in exited_ids else _normal_label()
            for tid in track_ids
        )
        return DetectionResult(
            boxes=pose.boxes,
            labels=labels,
            keypoints=pose.keypoints,
            bed_box=self._bed_box,
        )


def _bed_exit_label() -> DetectionLabel:
    return DetectionLabel(text=BED_EXIT_LABEL_TEXT, confidence=1.0, is_fall=False)


def _normal_label() -> DetectionLabel:
    return DetectionLabel(text=NORMAL_LABEL_TEXT, confidence=0.0, is_fall=False)
