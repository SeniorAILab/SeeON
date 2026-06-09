from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol, runtime_checkable

from util.frame_source import Frame, FrameSource, VideoFileSource

# Frame / FrameSource / VideoFileSource are the cross-cutting frame-intake seam
# and live in ml/util/ (ADR-006). They are re-exported here so demo modules can
# keep importing the seam types from one place.
__all__ = [
    "Frame",
    "FrameSource",
    "VideoFileSource",
    "BoundingBox",
    "DetectionLabel",
    "DetectionResult",
    "ModelModule",
]


@dataclass(frozen=True, slots=True)
class BoundingBox:
    x1: int
    y1: int
    x2: int
    y2: int
    confidence: float


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


@runtime_checkable
class ModelModule(Protocol):
    def predict(self, frame: Frame) -> DetectionResult: ...
