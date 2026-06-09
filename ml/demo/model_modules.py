from __future__ import annotations

from typing import Final

from demo.seam import BoundingBox, DetectionLabel, DetectionResult, Frame
from demo.yolo_runtime import YoloPoseRunner

POSE_MODEL_SIZES: Final[tuple[str, ...]] = ("n", "s", "m", "l", "x")


def pose_weight_filename(size: str) -> str:
    """Map a YOLO26-pose size letter to its weight filename (model-seam swap).

    The single one-line weight swap that makes the model size selectable.
    """
    if size not in POSE_MODEL_SIZES:
        raise ValueError(f"Unknown YOLO26-pose size {size!r}; expected one of {POSE_MODEL_SIZES}")
    return f"yolo26{size}-pose.pt"


class YoloPoseModule:
    """Pose ModelModule wrapping YoloPoseRunner. Emits {boxes, keypoints}.

    A single YOLO26-pose inference yields both person bounding boxes and COCO-17
    keypoints, so this one module drives both overlays. ``boxes`` is populated
    from the pose model's own person detections (label text="person").
    """

    def __init__(self, size: str = "n", confidence: float = 0.05) -> None:
        self._runner = YoloPoseRunner(
            model_path=pose_weight_filename(size), confidence=confidence
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
