from __future__ import annotations

from typing import Final

from contracts.artifacts import WEIGHTS_DIR, pose_weight_filename, pose_weight_path  # noqa: F401
from core.contract import BoundingBox, DetectionLabel, DetectionResult, Frame
from runners.yolo_pose import YoloPoseRunner

POSE_MODEL_SIZES: Final[tuple[str, ...]] = ("n", "s", "m", "l", "x")

# Display labels for the size selector — user-approved wording (issue #58).
# Keys mirror POSE_MODEL_SIZES; values show [size] / [hardware context].
POSE_MODEL_SIZE_LABELS: Final[dict[str, str]] = {
    "n": "nano / 일반 PC·노트북 (실시간)",
    "s": "small / 일반 노트북 (준실시간)",
    "m": "medium / GPU·Apple Silicon 권장",
    "l": "large / 전용 GPU 권장",
    "x": "xlarge / 고성능 GPU (정밀 분석용)",
}

# Pose weight path helpers are delegated to contracts.artifacts (ADR-015).
class YoloPoseModule:
    """Pose ModelModule wrapping YoloPoseRunner. Emits {boxes, keypoints}.

    A single YOLO26-pose inference yields both person bounding boxes and COCO-17
    keypoints, so this one module drives both overlays. ``boxes`` is populated
    from the pose model's own person detections (label text="person").
    """

    def __init__(self, size: str = "n", confidence: float = 0.05) -> None:
        WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)
        self._runner = YoloPoseRunner(
            model_path=str(pose_weight_path(size)), confidence=confidence
        )

    def predict(self, frame: Frame) -> DetectionResult:
        poses, raw_boxes = self._runner.predict_full(frame.image)
        boxes = tuple(
            BoundingBox(x1=x1, y1=y1, x2=x2, y2=y2, confidence=conf)
            for x1, y1, x2, y2, conf in raw_boxes
        )
        labels = tuple(
            DetectionLabel(text="person", confidence=conf, is_fall=False)
            for _x1, _y1, _x2, _y2, conf in raw_boxes
        )
        return DetectionResult(boxes=boxes, labels=labels, keypoints=poses)
