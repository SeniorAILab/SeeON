from __future__ import annotations

from demo.seam import BoundingBox, DetectionLabel, DetectionResult, Frame
from demo.yolo_runtime import YoloPoseRunner


class YoloPoseModule:
    """Pose ModelModule wrapping YoloPoseRunner. Emits {boxes, keypoints}.

    A single YOLO26-pose inference yields both person bounding boxes and COCO-17
    keypoints, so this one module drives both overlays. ``boxes`` is populated
    from the pose model's own person detections (label text="person").
    """

    def __init__(self, model_path: str = "yolo26n-pose.pt", confidence: float = 0.05) -> None:
        self._runner = YoloPoseRunner(model_path=model_path, confidence=confidence)

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
