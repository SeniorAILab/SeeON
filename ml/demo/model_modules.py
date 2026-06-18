from __future__ import annotations

from pathlib import Path
from typing import Final

import numpy as np

from demo.mediapipe_pose import (
    MediaPipePoseEstimator,
    PoseEstimator,
    blank_coco17_keypoints,
    remap_landmarks_to_coco17,
)
from demo.seam import BoundingBox, DetectionLabel, DetectionResult, Frame
from demo.yolo_runtime import (
    PERSON_MODEL_CONFIDENCE,
    YoloPersonRunner,
    YoloPoseRunner,
)

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

# Upstream pose weights are an ephemeral, re-downloadable cache — distinct from
# curated comparison checkpoints under ml/models/fall/pretrained/. They live
# under ml/models/pose/ so Ultralytics neither pollutes the project root nor the
# fall model tree. Metadata for the pose cache lives at ml/models/pose/metadata.json.
# See ADR-015.
WEIGHTS_DIR: Final = Path(__file__).resolve().parent.parent / "models" / "pose"


def pose_weight_filename(size: str) -> str:
    """Map a YOLO26-pose size letter to its weight filename (model-seam swap).

    The single one-line weight swap that makes the model size selectable.
    """
    if size not in POSE_MODEL_SIZES:
        raise ValueError(f"Unknown YOLO26-pose size {size!r}; expected one of {POSE_MODEL_SIZES}")
    return f"yolo26{size}-pose.pt"


def pose_weight_path(size: str) -> Path:
    """Resolve a pose-size letter to its weight path under the ml/models/pose/ cache.

    Keeps ``pose_weight_filename`` a pure identity (its own contract) and layers
    the cache location on top, so the download/load target is ml/models/pose/ rather
    than the current working directory.
    """
    return WEIGHTS_DIR / pose_weight_filename(size)


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


# Person-detection weight cache for the hybrid backend — a function axis under
# ml/models/ alongside pose/, fall/, and bed/ (docs/rules/ml-models.md;
# gitignored, never committed). Holds the plain COCO-detection weight
# (yolo26{size}.pt) that localizes people before MediaPipe estimates the pose.
PERSON_WEIGHTS_DIR: Final = Path(__file__).resolve().parent.parent / "models" / "person"

# Pose-backend selector keys (issue #218). The hybrid path swaps only the pose
# source; features/classifier/overlay stay identical because both backends emit
# the same COCO-17 DetectionResult.
YOLO_POSE_BACKEND: Final = "yolo-pose"
YOLO_MEDIAPIPE_BACKEND: Final = "yolo-mediapipe"
POSE_BACKENDS: Final[tuple[str, ...]] = (YOLO_POSE_BACKEND, YOLO_MEDIAPIPE_BACKEND)
POSE_BACKEND_LABELS: Final[dict[str, str]] = {
    YOLO_POSE_BACKEND: "YOLO26-pose (단일 패스, 기본)",
    YOLO_MEDIAPIPE_BACKEND: "YOLO 박스 + MediaPipe 포즈 (하이브리드)",
}


def person_weight_filename(size: str) -> str:
    """Map a YOLO26 size letter to its COCO-detection weight filename.

    Same size axis as the pose weights, but the plain (non-``-pose``) detection
    family — YOLO only localizes people in the hybrid backend.
    """
    if size not in POSE_MODEL_SIZES:
        raise ValueError(f"Unknown YOLO26 size {size!r}; expected one of {POSE_MODEL_SIZES}")
    return f"yolo26{size}.pt"


def person_weight_path(size: str) -> Path:
    """Resolve a size letter to its detection-weight path under ml/models/person/."""
    return PERSON_WEIGHTS_DIR / person_weight_filename(size)


class MediaPipePoseModule:
    """Hybrid pose ModelModule: YOLO localizes persons, MediaPipe estimates pose.

    YOLO26 detection (``yolo26{size}.pt``, COCO class 0) yields person bounding
    boxes; each box's ROI is handed to MediaPipe Pose, whose 33 landmarks are
    remapped to COCO-17 and translated to full-frame pixels. The emitted
    DetectionResult is shape-identical to ``YoloPoseModule``'s, so features,
    classifiers, and the overlay reuse it unchanged (issue #218).

    ``runner`` and ``estimator`` are injectable so unit tests drive the
    composition with fakes and never import ultralytics or mediapipe.
    """

    def __init__(
        self,
        size: str = "n",
        confidence: float = PERSON_MODEL_CONFIDENCE,
        min_detection_confidence: float = 0.5,
        *,
        runner: YoloPersonRunner | None = None,
        estimator: PoseEstimator | None = None,
    ) -> None:
        if runner is None:
            PERSON_WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)
            runner = YoloPersonRunner(
                model_path=str(person_weight_path(size)), confidence=confidence
            )
        if estimator is None:
            estimator = MediaPipePoseEstimator(
                min_detection_confidence=min_detection_confidence
            )
        self._runner = runner
        self._estimator = estimator

    def predict(self, frame: Frame) -> DetectionResult:
        person_boxes = self._runner.detect_persons(frame.image)
        if not person_boxes:
            return DetectionResult()
        boxes: list[BoundingBox] = []
        labels: list[DetectionLabel] = []
        keypoints: list[tuple[tuple[int, int, float], ...]] = []
        for x1, y1, x2, y2, conf in person_boxes:
            boxes.append(BoundingBox(x1=x1, y1=y1, x2=x2, y2=y2, confidence=conf))
            labels.append(DetectionLabel(text="person", confidence=conf, is_fall=False))
            keypoints.append(self._pose_for_box(frame.image, x1, y1, x2, y2))
        return DetectionResult(
            boxes=tuple(boxes), labels=tuple(labels), keypoints=tuple(keypoints)
        )

    def _pose_for_box(
        self, image: np.ndarray, x1: int, y1: int, x2: int, y2: int
    ) -> tuple[tuple[int, int, float], ...]:
        """Estimate one person's COCO-17 pose from their clamped YOLO ROI.

        Clamps the box to the frame, hands the contiguous RGB crop to MediaPipe,
        and remaps the landmarks back to full-frame pixels. Degrades to
        ``blank_coco17_keypoints`` for an empty crop or a no-pose result.
        """
        h, w = image.shape[:2]
        cx1, cy1 = max(0, x1), max(0, y1)
        cx2, cy2 = min(w, x2), min(h, y2)
        roi_w, roi_h = cx2 - cx1, cy2 - cy1
        if roi_w <= 0 or roi_h <= 0:
            return blank_coco17_keypoints()
        roi = np.ascontiguousarray(image[cy1:cy2, cx1:cx2])
        landmarks = self._estimator.infer(roi)
        if landmarks is None:
            return blank_coco17_keypoints()
        return remap_landmarks_to_coco17(
            landmarks, x1=cx1, y1=cy1, roi_w=roi_w, roi_h=roi_h
        )
