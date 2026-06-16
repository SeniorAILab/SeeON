from __future__ import annotations

from pathlib import Path
from typing import Final, TypeAlias

from numpy.typing import NDArray

PoseDetections: TypeAlias = tuple[tuple[tuple[int, int, float], ...], ...]
POSE_MODEL_CONFIDENCE: Final = 0.05

# COCO class index for "bed" in the standard 80-class COCO label set. The weight
# is asserted to actually map this index to "bed" at runtime (guards against a
# weight-family rename); a mismatch degrades gracefully to "no bed".
COCO_BED_CLASS_ID: Final = 59
BED_MODEL_CONFIDENCE: Final = 0.25


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


class YoloBedRunner:
    """One-shot COCO-detection runner that returns the bed ROI (class 59).

    Mirrors ``YoloPoseRunner`` but reads ``r.boxes`` only (no keypoints) and
    keeps just the highest-confidence ``bed`` detection. The bed is static, so
    this is meant to run **once** at stream start — the per-frame path stays a
    single pose pass (ADR-005 §3).

    Robustness: the COCO class id for "bed" is asserted against the loaded
    model's ``names`` map at construction. If the weight family does not map
    index 59 → "bed", ``detect_bed`` degrades gracefully to ``None`` ("no bed")
    rather than trusting a wrong class id.
    """

    def __init__(
        self,
        model_path: str = "yolo26n.pt",
        confidence: float = BED_MODEL_CONFIDENCE,
    ) -> None:
        self._model = _load_yolo_model(Path(model_path))
        self._confidence = confidence
        self._bed_class_id = _resolve_bed_class_id(getattr(self._model, "names", None))

    def detect_bed(
        self, frame: NDArray
    ) -> tuple[int, int, int, int, float] | None:
        """Return the highest-confidence bed box ``(x1,y1,x2,y2,conf)`` or ``None``.

        ``None`` covers both "no bed in frame" and "weight does not expose a
        'bed' class" — both are the graceful no-bed state, never an exception.
        """
        if self._bed_class_id is None:
            return None
        results = self._model.predict(source=frame, conf=self._confidence, verbose=False)
        r = results[0]
        if r.boxes is None or len(r.boxes) == 0:
            return None
        xyxy = r.boxes.xyxy.cpu().numpy()
        confs = r.boxes.conf.cpu().numpy()
        classes = r.boxes.cls.cpu().numpy()

        best: tuple[int, int, int, int, float] | None = None
        for box, conf, cls in zip(xyxy, confs, classes, strict=True):
            if int(cls) != self._bed_class_id:
                continue
            if best is None or float(conf) > best[4]:
                best = (int(box[0]), int(box[1]), int(box[2]), int(box[3]), float(conf))
        return best


def _resolve_bed_class_id(names: object) -> int | None:
    """Return the class id mapping to 'bed', preferring the COCO index 59.

    Returns ``None`` when the model's ``names`` map does not expose a "bed"
    class, so callers degrade to the graceful no-bed state.
    """
    if not isinstance(names, dict):
        return None
    if str(names.get(COCO_BED_CLASS_ID, "")).lower() == "bed":
        return COCO_BED_CLASS_ID
    for class_id, class_name in names.items():
        if str(class_name).lower() == "bed":
            return int(class_id)
    return None


def _load_yolo_model(weight_path: Path | str):
    from ultralytics import YOLO

    return YOLO(str(weight_path))
