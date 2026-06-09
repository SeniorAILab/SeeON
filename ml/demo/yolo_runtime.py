from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Final, TypeAlias

from numpy.typing import NDArray

from demo.model_registry import ModelSpec
from demo.pretrained import artifact_for_spec

PoseDetections: TypeAlias = tuple[tuple[tuple[int, int, float], ...], ...]
POSE_MODEL_CONFIDENCE: Final = 0.05


@dataclass(frozen=True, slots=True)
class DetectionBox:
    model_id: str
    label: str
    confidence: float
    x1: int
    y1: int
    x2: int
    y2: int
    is_fall: bool


@dataclass(frozen=True, slots=True)
class YoloFrameAnalysis:
    model_id: str
    frame_index: int
    time_sec: float
    detections: tuple[DetectionBox, ...]
    peak_confidence: float
    fall_label: str | None


class YoloFallRunner:
    def __init__(self, spec: ModelSpec, threshold: float) -> None:
        artifact = artifact_for_spec(spec)
        self.spec = spec
        self.threshold = threshold
        self._model = _load_yolo_model(artifact.weight_path)

    def predict_frame(
        self,
        frame: NDArray,
        frame_index: int,
        time_sec: float,
    ) -> YoloFrameAnalysis:
        results = self._model.predict(source=frame, conf=self.threshold, verbose=False)
        boxes = _extract_boxes(
            model_id=self.spec.model_id,
            result=results[0],
            fall_labels=self.spec.fall_labels,
        )
        fall_boxes = [box for box in boxes if box.is_fall]
        peak_confidence = max((box.confidence for box in fall_boxes), default=0.0)
        fall_label = max(fall_boxes, key=lambda box: box.confidence).label if fall_boxes else None
        return YoloFrameAnalysis(
            model_id=self.spec.model_id,
            frame_index=frame_index,
            time_sec=round(time_sec, 3),
            detections=tuple(boxes),
            peak_confidence=round(peak_confidence, 4),
            fall_label=fall_label,
        )


class YoloPoseRunner:
    def __init__(
        self,
        model_path: str = "yolo26n-pose.pt",
        confidence: float = POSE_MODEL_CONFIDENCE,
    ) -> None:
        self._model = _load_yolo_model(Path(model_path))
        self._confidence = confidence

    def predict_full(
        self, frame: NDArray
    ) -> tuple[PoseDetections, tuple[tuple[int, int, int, int, float], ...]]:
        """Return (pose_detections, person_boxes) where each box is (x1,y1,x2,y2,conf).

        Runs the model once and extracts both keypoints and bounding boxes so
        callers can populate a full DetectionResult without a second inference.
        """
        results = self._model.predict(source=frame, conf=self._confidence, verbose=False)
        r = results[0]

        # --- keypoints ---
        kp_obj = getattr(r, "keypoints", None)
        if kp_obj is None or kp_obj.xy is None:
            poses: PoseDetections = ()
        else:
            xy_values = kp_obj.xy.cpu().numpy()
            conf_values = None if kp_obj.conf is None else kp_obj.conf.cpu().numpy()
            if len(xy_values) == 0:
                poses = ()
            else:
                pose_list: list[tuple[tuple[int, int, float], ...]] = []
                for person_index, person_points in enumerate(xy_values):
                    points: list[tuple[int, int, float]] = []
                    for point_index, point in enumerate(person_points):
                        confidence = (
                            1.0
                            if conf_values is None
                            else float(conf_values[person_index][point_index])
                        )
                        points.append((int(point[0]), int(point[1]), confidence))
                    pose_list.append(tuple(points))
                poses = tuple(pose_list)

        # --- person bounding boxes ---
        if r.boxes is None or len(r.boxes) == 0:
            raw_boxes: tuple[tuple[int, int, int, int, float], ...] = ()
        else:
            xyxy = r.boxes.xyxy.cpu().numpy()
            confs = r.boxes.conf.cpu().numpy()
            raw_boxes = tuple(
                (int(c[0]), int(c[1]), int(c[2]), int(c[3]), float(conf))
                for c, conf in zip(xyxy, confs)
            )

        return poses, raw_boxes


def _load_yolo_model(weight_path: Path | str):
    from ultralytics import YOLO

    return YOLO(str(weight_path))


def _extract_boxes(
    model_id: str,
    result,
    fall_labels: Sequence[str],
) -> tuple[DetectionBox, ...]:
    if result.boxes is None or len(result.boxes) == 0:
        return ()
    names = result.names
    xyxy = result.boxes.xyxy.cpu().numpy()
    confidences = result.boxes.conf.cpu().numpy()
    classes = result.boxes.cls.cpu().numpy().astype(int)
    normalized_fall_labels = {_normalize_label(label) for label in fall_labels}
    boxes: list[DetectionBox] = []
    for index, coords in enumerate(xyxy):
        label = str(names.get(int(classes[index]), f"class_{classes[index]}"))
        boxes.append(
            DetectionBox(
                model_id=model_id,
                label=label,
                confidence=round(float(confidences[index]), 4),
                x1=int(coords[0]),
                y1=int(coords[1]),
                x2=int(coords[2]),
                y2=int(coords[3]),
                is_fall=_normalize_label(label) in normalized_fall_labels,
            )
        )
    return tuple(boxes)


def _normalize_label(label: str) -> str:
    return label.casefold().replace("_", "").replace("-", "").replace(" ", "")
