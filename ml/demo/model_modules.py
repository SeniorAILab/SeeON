from __future__ import annotations

from pathlib import Path
from typing import Final

from demo.seam import BoundingBox, DetectionLabel, DetectionResult, Frame
from demo.yolo_runtime import YoloPoseRunner

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
