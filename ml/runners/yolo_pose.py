"""YOLO pose runner implementation."""

from __future__ import annotations

from pathlib import Path
from typing import Final, TypeAlias

from numpy.typing import NDArray

from contracts.artifacts import pose_weight_path  # noqa: F401

PoseDetections: TypeAlias = tuple[tuple[tuple[int, int, float], ...], ...]
POSE_MODEL_CONFIDENCE: Final = 0.05


def _load_yolo_model(weight_path: Path | str):
    from ultralytics import YOLO

    return YOLO(str(weight_path))


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
                for c, conf in zip(xyxy, confs, strict=True)
            )

        return poses, raw_boxes
