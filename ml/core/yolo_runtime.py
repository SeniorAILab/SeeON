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
BED_NMS_IOU_THRESHOLD: Final = 0.5
BED_MERGE_IOU_THRESHOLD: Final = 0.5


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
    """Low-frequency COCO-detection runner that returns bed ROIs (class 59).

    Mirrors ``YoloPoseRunner`` but reads ``r.boxes`` only (no keypoints). The
    bed detector uses this for initial multi-frame seeding and sparse re-detects;
    the per-frame path stays a single pose pass (ADR-005 §3).

    Robustness: the COCO class id for "bed" is asserted against the loaded
    model's ``names`` map at construction. If the weight family does not map
    index 59 → "bed", ``detect_beds`` degrades gracefully to an empty tuple
    rather than trusting a wrong class id.
    """

    def __init__(
        self,
        model_path: str = "yolo26m.pt",
        confidence: float = BED_MODEL_CONFIDENCE,
        max_beds: int | None = None,
    ) -> None:
        self._model = _load_yolo_model(Path(model_path))
        self._confidence = confidence
        self._max_beds = max_beds
        self._bed_class_id = _resolve_bed_class_id(getattr(self._model, "names", None))

    def detect_beds(
        self, frame: NDArray
    ) -> tuple[tuple[int, int, int, int, float], ...]:
        """Return bed boxes ``(x1,y1,x2,y2,conf)`` after NMS/overlap merge.

        Ordering is deterministic by geometry before confidence so callers can
        use the tuple position as a stable bed-id seed for the cached seed frame.
        """
        if self._bed_class_id is None:
            return ()
        results = self._model.predict(source=frame, conf=self._confidence, verbose=False)
        r = results[0]
        if r.boxes is None or len(r.boxes) == 0:
            return ()
        xyxy = r.boxes.xyxy.cpu().numpy()
        confs = r.boxes.conf.cpu().numpy()
        classes = r.boxes.cls.cpu().numpy()

        candidates = tuple(
            (int(box[0]), int(box[1]), int(box[2]), int(box[3]), float(conf))
            for box, conf, cls in zip(xyxy, confs, classes, strict=True)
            if int(cls) == self._bed_class_id and float(conf) >= self._confidence
        )
        return dedupe_bed_boxes(candidates, max_beds=self._max_beds)


def dedupe_bed_boxes(
    boxes: tuple[tuple[int, int, int, int, float], ...],
    *,
    max_beds: int | None = None,
) -> tuple[tuple[int, int, int, int, float], ...]:
    """Apply confidence NMS, overlap merge, and deterministic ordering.

    No hard cap by default: every distinct bed survives. Pass ``max_beds`` only
    to opt into an explicit ceiling (e.g. a test fixture); ``None`` keeps all.
    """
    if not boxes:
        return ()
    if max_beds is not None and max_beds <= 0:
        return ()

    nms_boxes: list[tuple[int, int, int, int, float]] = []
    for box in sorted(boxes, key=lambda b: (-b[4], b[0], b[1], b[2], b[3])):
        if all(_box_iou(box, kept) < BED_NMS_IOU_THRESHOLD for kept in nms_boxes):
            nms_boxes.append(box)

    merged = _merge_overlapping_beds(tuple(nms_boxes))
    ordered = sorted(merged, key=lambda b: (b[0], b[1], b[2], b[3], -b[4]))
    return tuple(ordered if max_beds is None else ordered[:max_beds])


def _merge_overlapping_beds(
    boxes: tuple[tuple[int, int, int, int, float], ...],
) -> tuple[tuple[int, int, int, int, float], ...]:
    clusters: list[list[tuple[int, int, int, int, float]]] = []
    for box in sorted(boxes, key=lambda b: (b[0], b[1], b[2], b[3], -b[4])):
        for cluster in clusters:
            if any(_box_iou(box, existing) >= BED_MERGE_IOU_THRESHOLD for existing in cluster):
                cluster.append(box)
                break
        else:
            clusters.append([box])

    merged: list[tuple[int, int, int, int, float]] = []
    for cluster in clusters:
        x1 = min(box[0] for box in cluster)
        y1 = min(box[1] for box in cluster)
        x2 = max(box[2] for box in cluster)
        y2 = max(box[3] for box in cluster)
        confidence = max(box[4] for box in cluster)
        merged.append((x1, y1, x2, y2, confidence))
    return tuple(merged)


def _box_iou(
    a: tuple[int, int, int, int, float],
    b: tuple[int, int, int, int, float],
) -> float:
    left = max(a[0], b[0])
    top = max(a[1], b[1])
    right = min(a[2], b[2])
    bottom = min(a[3], b[3])
    width = max(0, right - left)
    height = max(0, bottom - top)
    intersection = width * height
    if intersection == 0:
        return 0.0
    area_a = max(0, a[2] - a[0]) * max(0, a[3] - a[1])
    area_b = max(0, b[2] - b[0]) * max(0, b[3] - b[1])
    union = area_a + area_b - intersection
    if union <= 0:
        return 0.0
    return intersection / union

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
