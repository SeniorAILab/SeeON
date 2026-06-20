from __future__ import annotations

from dataclasses import dataclass, field
from typing import Final

FALL_LABEL_TEXT: Final = "FALL"
NORMAL_LABEL_TEXT: Final = "NORMAL"


@dataclass(frozen=True, slots=True)
class BoundingBox:
    x1: int
    y1: int
    x2: int
    y2: int
    confidence: float
    # Optional mask contour (issue #243): bed ROIs from instance segmentation
    # carry the silhouette polygon for shape-accurate rendering. None for plain
    # detection boxes (person/fall). x1..y2 stays the source of truth for IoU.
    polygon: tuple[tuple[int, int], ...] | None = None


@dataclass(frozen=True, slots=True)
class DetectionLabel:
    text: str
    confidence: float
    is_fall: bool


@dataclass(frozen=True, slots=True)
class DetectionResult:
    boxes: tuple[BoundingBox, ...] = field(default_factory=tuple)
    labels: tuple[DetectionLabel, ...] = field(default_factory=tuple)
    # per-person COCO-17 keypoints; each kpt = (x:int, y:int, conf:float)
    keypoints: tuple[tuple[tuple[int, int, float], ...], ...] = field(default_factory=tuple)
    # static bed ROIs from a one-shot COCO detection at stream start;
    # cached once and carried per-frame so the per-frame path stays a single pose pass.
    bed_boxes: tuple[BoundingBox, ...] = field(default_factory=tuple)
    bed_exit_statuses: tuple[object, ...] = field(default_factory=tuple)
