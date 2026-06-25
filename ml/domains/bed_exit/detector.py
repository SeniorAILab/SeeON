from __future__ import annotations

from dataclasses import dataclass

from contracts.event import MutableEventPayload
from contracts.observation import BoundingBox, FrameObservation
from domains.bed_exit.schema import BedExitEvent, BedExitFrame, BedStatus
from perception.tracker import GreedyIouTracker


@dataclass(slots=True)
class _Assignment:
    bed_id: int | None = None
    candidate_bed_id: int | None = None
    candidate_frames: int = 0
    grace_frames: int = 0


class BedExitMonitor:
    """Sticky per-person bed assignment and own-bed exit detector."""

    enabled = True

    def __init__(
        self,
        *,
        min_containment: float = 0.35,
        hold_frames: int = 2,
        grace_frames: int = 3,
        tracker: GreedyIouTracker | None = None,
    ) -> None:
        if min_containment <= 0.0 or min_containment > 1.0:
            raise ValueError("min_containment must be in (0, 1]")
        if hold_frames < 1:
            raise ValueError("hold_frames must be >= 1")
        if grace_frames < 0:
            raise ValueError("grace_frames must be >= 0")
        self._min_containment = min_containment
        self._hold_frames = hold_frames
        self._grace_frames = grace_frames
        self._tracker = tracker if tracker is not None else GreedyIouTracker()
        self._assignments: dict[int, _Assignment] = {}

    def update(
        self,
        observation: FrameObservation,
        time_sec: float | None = None,
    ) -> tuple[MutableEventPayload, ...]:
        frame = self.update_boxes(
            bed_boxes=observation.bed_boxes,
            person_boxes=observation.boxes,
        )
        return tuple(_event_dict(event, time_sec) for event in frame.events)

    def update_boxes(
        self,
        *,
        bed_boxes: tuple[BoundingBox, ...],
        person_boxes: tuple[BoundingBox, ...],
    ) -> BedExitFrame:
        person_ids = self._tracker.update(person_boxes)
        for stale_id in set(self._assignments) - self._tracker.live_ids:
            self._assignments.pop(stale_id, None)

        events: list[BedExitEvent] = []
        occupied: dict[int, int] = {}
        exit_beds: set[int] = set()

        for person_id, person_box in zip(person_ids, person_boxes, strict=True):
            assignment = self._assignments.setdefault(person_id, _Assignment())
            containments = tuple(_containment_ratio(person_box, bed) for bed in bed_boxes)
            best_bed_id = _best_bed_id(containments, self._min_containment)

            if assignment.bed_id is None:
                self._update_candidate(assignment, best_bed_id)
                if assignment.candidate_frames >= self._hold_frames:
                    assignment.bed_id = assignment.candidate_bed_id
                    assignment.grace_frames = 0
                if assignment.bed_id is not None:
                    occupied[assignment.bed_id] = person_id
                continue

            own_ratio = (
                containments[assignment.bed_id]
                if assignment.bed_id < len(containments)
                else 0.0
            )
            in_own_bed = own_ratio >= self._min_containment
            in_other_bed = any(
                bed_id != assignment.bed_id and ratio >= self._min_containment
                for bed_id, ratio in enumerate(containments)
            )

            if in_own_bed:
                assignment.grace_frames = 0
                occupied[assignment.bed_id] = person_id
                continue

            if in_other_bed:
                assignment.grace_frames = 0
                continue

            assignment.grace_frames += 1
            if assignment.grace_frames > self._grace_frames:
                exited_bed_id = assignment.bed_id
                events.append(BedExitEvent(person_id=person_id, bed_id=exited_bed_id))
                exit_beds.add(exited_bed_id)
                assignment.bed_id = None
                assignment.candidate_bed_id = None
                assignment.candidate_frames = 0
                assignment.grace_frames = 0

        statuses = tuple(
            BedStatus(
                bed_id=bed_id,
                box=bed_box,
                occupancy="exit"
                if bed_id in exit_beds
                else "occupied"
                if bed_id in occupied
                else "empty",
                person_id=occupied.get(bed_id),
            )
            for bed_id, bed_box in enumerate(bed_boxes)
        )
        return BedExitFrame(statuses=statuses, events=tuple(events))

    def _update_candidate(self, assignment: _Assignment, bed_id: int | None) -> None:
        if bed_id is None:
            assignment.candidate_bed_id = None
            assignment.candidate_frames = 0
            return
        if assignment.candidate_bed_id == bed_id:
            assignment.candidate_frames += 1
        else:
            assignment.candidate_bed_id = bed_id
            assignment.candidate_frames = 1


def _best_bed_id(containments: tuple[float, ...], min_containment: float) -> int | None:
    candidates = [
        (ratio, bed_id) for bed_id, ratio in enumerate(containments) if ratio >= min_containment
    ]
    if not candidates:
        return None
    ratio, bed_id = max(candidates, key=lambda item: (item[0], -item[1]))
    return bed_id if ratio >= min_containment else None


def _containment_ratio(person: BoundingBox, bed: BoundingBox) -> float:
    left = max(person.x1, bed.x1)
    top = max(person.y1, bed.y1)
    right = min(person.x2, bed.x2)
    bottom = min(person.y2, bed.y2)
    width = max(0, right - left)
    height = max(0, bottom - top)
    intersection = width * height
    person_area = max(0, person.x2 - person.x1) * max(0, person.y2 - person.y1)
    if intersection == 0 or person_area <= 0:
        return 0.0
    return intersection / person_area


def _event_dict(event: BedExitEvent, time_sec: float | None) -> MutableEventPayload:
    return {
        "domain": "bed_exit",
        "event_type": "bed-exit",
        "identity": f"{event.person_id}:{event.bed_id}",
        "person_id": event.person_id,
        "bed_id": event.bed_id,
        "probability": 1.0,
        "time_sec": 0.0 if time_sec is None else time_sec,
    }
