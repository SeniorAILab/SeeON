"""Pure greedy-IoU multi-person tracker for the demo layer.

No numpy, no ultralytics — plain dataclasses and built-in Python only so this
module is importable without heavy deps and fully unit-testable in isolation.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from demo.seam import BoundingBox


def iou(a: BoundingBox, b: BoundingBox) -> float:
    """Intersection-over-union for two axis-aligned bounding boxes.

    Returns 0.0 when the boxes do not overlap or when either box has zero area.
    """
    inter_x1 = max(a.x1, b.x1)
    inter_y1 = max(a.y1, b.y1)
    inter_x2 = min(a.x2, b.x2)
    inter_y2 = min(a.y2, b.y2)

    inter_w = max(0, inter_x2 - inter_x1)
    inter_h = max(0, inter_y2 - inter_y1)
    inter_area = inter_w * inter_h

    if inter_area == 0:
        return 0.0

    area_a = (a.x2 - a.x1) * (a.y2 - a.y1)
    area_b = (b.x2 - b.x1) * (b.y2 - b.y1)
    union_area = area_a + area_b - inter_area

    if union_area <= 0:
        return 0.0

    return inter_area / union_area


@dataclass
class _Track:
    track_id: int
    last_box: BoundingBox
    misses: int = field(default=0)


class GreedyIouTracker:
    """Greedy IoU tracker that assigns persistent track ids to bounding boxes.

    On each ``update(boxes)`` call:

    1. Compute IoU between every live track's ``last_box`` and every incoming box.
    2. Sort all (track, box) pairs by IoU descending.
    3. Greedily match pairs whose IoU >= ``min_iou``; each track and box may only
       be used in one match.
    4. Unmatched boxes are assigned fresh, auto-incrementing ids.
    5. Unmatched tracks accumulate ``misses``; those whose ``misses > max_misses``
       are evicted.  A missed track's ``last_box`` is kept for future matching
       while it survives the TTL window.
    """

    def __init__(self, min_iou: float = 0.3, max_misses: int = 30) -> None:
        self._min_iou = min_iou
        self._max_misses = max_misses
        self._tracks: list[_Track] = []
        self._next_id: int = 0

    @property
    def live_ids(self) -> frozenset[int]:
        """Frozenset of track ids that are currently alive (not yet evicted)."""
        return frozenset(t.track_id for t in self._tracks)

    def update(self, boxes: tuple[BoundingBox, ...]) -> tuple[int, ...]:
        """Associate *boxes* with live tracks; return one track id per box (index-aligned).

        Parameters
        ----------
        boxes:
            Bounding boxes detected this frame.  May be an empty tuple.

        Returns
        -------
        tuple[int, ...]
            Track ids, one per box, in the same order as *boxes*.
        """
        # Snapshot existing tracks before appending new ones this frame.
        existing = list(self._tracks)

        # --- Step 1: compute all (existing_track, new_box) IoU pairs ---
        pairs: list[tuple[float, int, int]] = []  # (score, track_idx, box_idx)
        for ti, track in enumerate(existing):
            for bi, box in enumerate(boxes):
                score = iou(track.last_box, box)
                if score > 0.0:
                    pairs.append((score, ti, bi))

        pairs.sort(key=lambda t: t[0], reverse=True)

        # --- Step 2: greedy matching ---
        matched_track_idxs: set[int] = set()
        matched_box_idxs: set[int] = set()
        box_to_id: dict[int, int] = {}

        for score, ti, bi in pairs:
            if score < self._min_iou:
                break
            if ti in matched_track_idxs or bi in matched_box_idxs:
                continue
            matched_track_idxs.add(ti)
            matched_box_idxs.add(bi)
            box_to_id[bi] = existing[ti].track_id
            existing[ti].last_box = boxes[bi]
            existing[ti].misses = 0

        # --- Step 3: fresh ids for unmatched boxes ---
        new_tracks: list[_Track] = []
        for bi in range(len(boxes)):
            if bi not in matched_box_idxs:
                new_id = self._next_id
                self._next_id += 1
                box_to_id[bi] = new_id
                new_tracks.append(_Track(track_id=new_id, last_box=boxes[bi]))

        # --- Step 4: accumulate misses for unmatched existing tracks; evict if needed ---
        surviving_existing: list[_Track] = []
        for ti, track in enumerate(existing):
            if ti in matched_track_idxs:
                surviving_existing.append(track)
            else:
                track.misses += 1
                if track.misses <= self._max_misses:
                    surviving_existing.append(track)
                # else: evicted — drop silently

        self._tracks = surviving_existing + new_tracks

        return tuple(box_to_id[bi] for bi in range(len(boxes)))
