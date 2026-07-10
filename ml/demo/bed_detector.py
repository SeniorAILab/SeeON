"""Multi-frame bed-ROI detector for the bed-exit demo (issue #100/#239/#243).

The bed scene is mostly static, but real nursing-home footage can reveal beds
only after several frames or after camera/person motion. The caller seeds ROIs
from a small frame union and re-detects periodically at low frequency. Every
rendered frame still keeps the single YOLO26-pose pass — this
detector is not part of the per-frame pose path.

Bed localization uses COCO instance segmentation (ADR): each bed carries a
mask polygon for shape-accurate rendering, with the axis-aligned bbox derived
for the bed-exit containment logic. ``BedDetector`` owns no frame source and the
runner is injectable so unit tests can stub inference without a real model.
"""

from __future__ import annotations

from pathlib import Path
from typing import Final, Protocol

from numpy.typing import NDArray

from contracts import BoundingBox, Frame
from contracts.runner import BedRunnerResult

# bed-localization weight cache — a function axis under ml/models/ alongside
# pose/ and fall/ (docs/rules/ml-models.md; gitignored, never committed).
BED_WEIGHTS_DIR: Final = Path(__file__).resolve().parent.parent / "models" / "bed"
BED_WEIGHT_FILENAME: Final = "yolo26m-seg.pt"


def bed_weight_path() -> Path:
    """Resolve the bed COCO instance-seg weight under the ml/models/bed/ cache."""
    return BED_WEIGHTS_DIR / BED_WEIGHT_FILENAME


class BedRunner(Protocol):
    """Minimal inference 계약(contract): one frame in → bed instances with masks.

    Each instance is ``(x1, y1, x2, y2, conf, polygon)``; ``polygon`` is the mask
    contour. Detection-only stubs may omit the polygon (5-tuple) → no mask.
    """

    def detect_beds(self, frame: NDArray) -> BedRunnerResult: ...


class BedDetector:
    """Detect the static bed ROIs (mask polygon + bbox) from seed frames.

    Returns an empty tuple when no bed is present (or the weight exposes no
    "bed" class) — the graceful "침대 없음" state, never an exception.
    """

    def __init__(self, runner: BedRunner) -> None:
        self._runner = runner

    def detect(self, frame: Frame) -> tuple[BoundingBox, ...]:
        return _build_beds(tuple(self._runner.detect_beds(frame.image).boxes))

    def detect_union(self, frames: tuple[Frame, ...]) -> tuple[BoundingBox, ...]:
        """Detect beds across multiple frames and return one stable deduped union."""
        raw = tuple(
            instance
            for frame in frames
            for instance in self._runner.detect_beds(frame.image).boxes
        )
        return _build_beds(raw)


def _build_beds(instances: tuple[tuple[object, ...], ...]) -> tuple[BoundingBox, ...]:
    """Dedup bed bboxes (no hard cap, issue #244) and attach each surviving box's
    mask polygon by best bbox overlap (issue #243)."""
    from worker.runners.yolo_bed_seg import dedupe_bed_boxes

    bbox5 = tuple(tuple(inst[:5]) for inst in instances)
    deduped = dedupe_bed_boxes(bbox5)
    polygons = tuple(
        (tuple(inst[:4]), inst[5]) for inst in instances if len(inst) > 5 and inst[5]
    )
    return tuple(
        BoundingBox(
            x1=x1,
            y1=y1,
            x2=x2,
            y2=y2,
            confidence=conf,
            polygon=_match_polygon((x1, y1, x2, y2), polygons),
        )
        for x1, y1, x2, y2, conf in deduped
    )


def _match_polygon(
    box: tuple[int, int, int, int],
    polygons: tuple[tuple[tuple[object, ...], object], ...],
) -> tuple[tuple[int, int], ...] | None:
    """Return the mask polygon whose source bbox overlaps ``box`` most (IoU >= 0.5)."""
    best_poly: tuple[tuple[int, int], ...] | None = None
    best_iou = 0.5
    for source_box, poly in polygons:
        iou = _iou(box, (source_box[0], source_box[1], source_box[2], source_box[3]))
        if iou >= best_iou:
            best_iou = iou
            best_poly = poly  # type: ignore[assignment]
    return best_poly


def _iou(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> float:
    left = max(a[0], b[0])
    top = max(a[1], b[1])
    right = min(a[2], b[2])
    bottom = min(a[3], b[3])
    if right <= left or bottom <= top:
        return 0.0
    intersection = (right - left) * (bottom - top)
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - intersection
    return intersection / union if union > 0 else 0.0
