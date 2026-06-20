"""Compatibility shim for YOLO runners.

The real model-execution implementations live in ``runners`` (ADR-057).
"""

from __future__ import annotations

from runners.yolo_bed_seg import (
    BED_MASK_MAX_POINTS,
    BED_MERGE_IOU_THRESHOLD,
    BED_MODEL_CONFIDENCE,
    BED_NMS_IOU_THRESHOLD,
    COCO_BED_CLASS_ID,
    YoloBedSegRunner,
    dedupe_bed_boxes,
)
from runners.yolo_pose import POSE_MODEL_CONFIDENCE, PoseDetections, YoloPoseRunner

__all__ = [
    "BED_MASK_MAX_POINTS",
    "BED_MERGE_IOU_THRESHOLD",
    "BED_MODEL_CONFIDENCE",
    "BED_NMS_IOU_THRESHOLD",
    "COCO_BED_CLASS_ID",
    "POSE_MODEL_CONFIDENCE",
    "PoseDetections",
    "YoloBedSegRunner",
    "YoloPoseRunner",
    "dedupe_bed_boxes",
]
