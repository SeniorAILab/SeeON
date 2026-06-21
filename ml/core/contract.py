from __future__ import annotations

from contracts.frame import Frame, FrameSource
from contracts.model import ModelModule
from contracts.observation import (
    FALL_LABEL_TEXT,
    NORMAL_LABEL_TEXT,
    BoundingBox,
    DetectionLabel,
    DetectionResult,
    FrameObservation,
)
from util.frame_source import CameraSource, VideoFileSource

# Frame / FrameSource / VideoFileSource / CameraSource are re-exported here so
# existing importers can keep importing the contract types from one place.
__all__ = [
    "Frame",
    "FrameSource",
    "CameraSource",
    "VideoFileSource",
    "BoundingBox",
    "DetectionLabel",
    "DetectionResult",
    "FrameObservation",
    "ModelModule",
    "FALL_LABEL_TEXT",
    "NORMAL_LABEL_TEXT",
]
