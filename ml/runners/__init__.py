"""Runner implementations for ML inference backends."""

from __future__ import annotations

from runners.device import select_device
from runners.registry import DEFAULT_REGISTRY, ModelRegistry, default_registry
from runners.sklearn_fall import (
    DEFAULT_OPERATING_THRESHOLD,
    EXPECTED_FEATURE_DIM,
    EXPECTED_STRIDE,
    EXPECTED_WINDOW,
    FallDetector,
    ModelInputError,
    ModelLoadError,
    ModelMetadata,
    get_model,
    reset_model_cache,
)
from runners.warmup import warmup_runner
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
    "DEFAULT_OPERATING_THRESHOLD",
    "DEFAULT_REGISTRY",
    "EXPECTED_FEATURE_DIM",
    "EXPECTED_STRIDE",
    "EXPECTED_WINDOW",
    "FallDetector",
    "ModelInputError",
    "ModelLoadError",
    "ModelMetadata",
    "ModelRegistry",
    "POSE_MODEL_CONFIDENCE",
    "PoseDetections",
    "YoloBedSegRunner",
    "YoloPoseRunner",
    "dedupe_bed_boxes",
    "default_registry",
    "get_model",
    "reset_model_cache",
    "select_device",
    "warmup_runner",
]
