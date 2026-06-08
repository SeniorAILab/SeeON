from __future__ import annotations

try:
    from demo.model_registry import ModelSpec
    from demo.seam import BoundingBox, DetectionLabel, DetectionResult, Frame
    from demo.yolo_runtime import YoloFallRunner, YoloPoseRunner
except ModuleNotFoundError:
    from model_registry import ModelSpec
    from seam import BoundingBox, DetectionLabel, DetectionResult, Frame
    from yolo_runtime import YoloFallRunner, YoloPoseRunner


class YoloDetectionModule:
    """Detection ModelModule wrapping YoloFallRunner. Emits {boxes, labels}."""

    def __init__(self, spec: ModelSpec, threshold: float | None = None) -> None:
        self._runner = YoloFallRunner(
            spec=spec,
            threshold=threshold if threshold is not None else spec.default_threshold,
        )

    def predict(self, frame: Frame) -> DetectionResult:
        analysis = self._runner.predict_frame(
            frame=frame.image,
            frame_index=frame.index,
            time_sec=frame.time_sec,
        )
        boxes = tuple(
            BoundingBox(x1=d.x1, y1=d.y1, x2=d.x2, y2=d.y2, confidence=d.confidence)
            for d in analysis.detections
        )
        labels = tuple(
            DetectionLabel(text=d.label, confidence=d.confidence, is_fall=d.is_fall)
            for d in analysis.detections
        )
        return DetectionResult(boxes=boxes, labels=labels)


class YoloPoseModule:
    """Pose ModelModule wrapping YoloPoseRunner. Emits {boxes, keypoints}.

    boxes is populated from the pose model's own person detections so that
    person-detection-rate is computable from the normalised DetectionResult
    (AC-10).
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
