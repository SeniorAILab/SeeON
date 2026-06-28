"""Training-owned YOLO pose extraction.

This module intentionally stays separate from the runtime ``worker``/``runners``
adapter: bounded-context separation means the training/runtime contract is the
model artifact, not shared runner code.
"""

from __future__ import annotations

from pathlib import Path
from typing import Final, TypeAlias

from numpy.typing import NDArray

from contracts.artifacts import pose_weight_path

PoseDetections: TypeAlias = tuple[tuple[tuple[int, int, float], ...], ...]
PersonBoxes: TypeAlias = tuple[tuple[int, int, int, int, float], ...]
POSE_MODEL_CONFIDENCE: Final = 0.05
_DEFAULT_POSE_WEIGHT: Final = str(pose_weight_path("n"))


class TrainingPoseExtractor:
    """Minimal YOLO-pose wrapper for offline training/evaluation jobs."""

    def __init__(
        self,
        model_path: str | Path = _DEFAULT_POSE_WEIGHT,
        confidence: float = POSE_MODEL_CONFIDENCE,
        device: str = "cpu",
    ) -> None:
        from ultralytics import YOLO

        self._model = YOLO(str(model_path))
        self._confidence = confidence
        self._device = device

    def predict_full(self, frame: NDArray) -> tuple[PoseDetections, PersonBoxes]:
        """Return ``(pose_detections, person_boxes)`` for one frame.

        ``pose_detections`` is one COCO-17 tuple per person, each keypoint as
        ``(x, y, conf)``. ``person_boxes`` is index-aligned with detections and
        contains ``(x1, y1, x2, y2, conf)``.
        """
        results = self._model.predict(
            source=frame, conf=self._confidence, verbose=False, device=self._device
        )
        result = results[0]

        keypoints = getattr(result, "keypoints", None)
        if keypoints is None or keypoints.xy is None:
            poses: PoseDetections = ()
        else:
            xy_values = keypoints.xy.cpu().numpy()
            conf_values = None if keypoints.conf is None else keypoints.conf.cpu().numpy()
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

        if result.boxes is None or len(result.boxes) == 0:
            boxes: PersonBoxes = ()
        else:
            xyxy = result.boxes.xyxy.cpu().numpy()
            confs = result.boxes.conf.cpu().numpy()
            boxes = tuple(
                (int(coords[0]), int(coords[1]), int(coords[2]), int(coords[3]), float(conf))
                for coords, conf in zip(xyxy, confs, strict=True)
            )

        return poses, boxes
