from __future__ import annotations

from dataclasses import dataclass, field
from typing import Final

# NOTE: DetectionResult remains the Slice 5a compatibility shim for existing
# consumers. It is superseded by FrameObservation, consumers migrate in Slice 5b,
# and the shim is removed in Slice 11.
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


Detections = tuple[tuple[BoundingBox, ...], tuple[DetectionLabel, ...]]
Regions = tuple[tuple[BoundingBox, ...], tuple[object, ...]]


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


@dataclass(frozen=True, slots=True)
class FrameObservation:
    """Per-frame perception observation in ADR-057 shape.

    detections: (boxes, labels)
    poses: per-person COCO-17 keypoints
    regions: (bed_boxes, bed_exit_statuses)
    """

    detections: Detections = field(default_factory=lambda: ((), ()))
    poses: tuple[tuple[tuple[int, int, float], ...], ...] = field(default_factory=tuple)
    regions: Regions = field(default_factory=lambda: ((), ()))

    @property
    def boxes(self) -> tuple[BoundingBox, ...]:
        return self.detections[0]

    @property
    def labels(self) -> tuple[DetectionLabel, ...]:
        return self.detections[1]

    @property
    def keypoints(self) -> tuple[tuple[tuple[int, int, float], ...], ...]:
        return self.poses

    @property
    def bed_boxes(self) -> tuple[BoundingBox, ...]:
        return self.regions[0]

    @property
    def bed_exit_statuses(self) -> tuple[object, ...]:
        return self.regions[1]

    @classmethod
    def from_detection_result(cls, result: DetectionResult) -> FrameObservation:
        return cls(
            detections=(result.boxes, result.labels),
            poses=result.keypoints,
            regions=(result.bed_boxes, result.bed_exit_statuses),
        )

    def to_detection_result(self) -> DetectionResult:
        boxes, labels = self.detections
        bed_boxes, bed_exit_statuses = self.regions
        return DetectionResult(
            boxes=boxes,
            labels=labels,
            keypoints=self.poses,
            bed_boxes=bed_boxes,
            bed_exit_statuses=bed_exit_statuses,
        )
