"""MediaPipe-Pose adapter for the hybrid YOLO+MediaPipe fall backend (issue #218).

The pure landmark→COCO-17 remap (:func:`remap_landmarks_to_coco17`) carries no
MediaPipe import, so it is unit-testable without the heavy native dependency.
``mediapipe`` is imported lazily only when :class:`MediaPipePoseEstimator` is
constructed — mirroring ``yolo_runtime._load_yolo_model`` for ultralytics, so a
plain ``import demo.mediapipe_pose`` (e.g. on the test path) pulls in nothing
native.
"""
from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path
from typing import Final, Protocol
from urllib.request import urlretrieve

# MediaPipe Pose emits 33 landmarks; the demo's feature/overlay pipeline speaks
# COCO-17. This maps each COCO-17 slot to its MediaPipe landmark index so a
# MediaPipe pose drops straight into the existing DetectionResult.keypoints
# contract (consumed by demo.features and demo.yolo_overlay unchanged).
# COCO-17 order: nose, l/r eye, l/r ear, l/r shoulder, l/r elbow, l/r wrist,
# l/r hip, l/r knee, l/r ankle.
MEDIAPIPE_TO_COCO17: Final[tuple[int, ...]] = (
    0,  # 0  nose            <- mp nose
    2,  # 1  left_eye        <- mp left_eye
    5,  # 2  right_eye       <- mp right_eye
    7,  # 3  left_ear        <- mp left_ear
    8,  # 4  right_ear       <- mp right_ear
    11,  # 5  left_shoulder  <- mp left_shoulder
    12,  # 6  right_shoulder <- mp right_shoulder
    13,  # 7  left_elbow     <- mp left_elbow
    14,  # 8  right_elbow    <- mp right_elbow
    15,  # 9  left_wrist     <- mp left_wrist
    16,  # 10 right_wrist    <- mp right_wrist
    23,  # 11 left_hip       <- mp left_hip
    24,  # 12 right_hip      <- mp right_hip
    25,  # 13 left_knee      <- mp left_knee
    26,  # 14 right_knee     <- mp right_knee
    27,  # 15 left_ankle     <- mp left_ankle
    28,  # 16 right_ankle    <- mp right_ankle
)
COCO17_COUNT: Final = 17
MEDIAPIPE_LANDMARK_COUNT: Final = 33


def blank_coco17_keypoints() -> tuple[tuple[int, int, float], ...]:
    """17 zero-confidence keypoints — the graceful 'no pose' result.

    Matches the shape downstream code expects (demo.features reads COCO indices
    5/6/11/12 and skips any keypoint below its confidence floor), so a blank
    result yields ``has_person`` purely from the box with no torso signal.
    """
    return tuple((0, 0, 0.0) for _ in range(COCO17_COUNT))


def remap_landmarks_to_coco17(
    landmarks: Sequence[tuple[float, float, float]],
    *,
    x1: int,
    y1: int,
    roi_w: int,
    roi_h: int,
) -> tuple[tuple[int, int, float], ...]:
    """Map MediaPipe's 33 ROI-normalized landmarks to COCO-17 full-frame pixels.

    ``landmarks[i] = (x_norm, y_norm, visibility)`` with coordinates normalized
    to the ROI (the YOLO person crop). Each kept COCO-17 point is translated to
    absolute frame pixels via ``px = x1 + x_norm * roi_w`` (and likewise for y),
    and ``visibility`` becomes the keypoint confidence consumed downstream.

    Returns :func:`blank_coco17_keypoints` when fewer than 33 landmarks are
    supplied (degenerate MediaPipe output) so callers never index out of range.
    """
    if len(landmarks) < MEDIAPIPE_LANDMARK_COUNT:
        return blank_coco17_keypoints()
    coco: list[tuple[int, int, float]] = []
    for mp_index in MEDIAPIPE_TO_COCO17:
        x_norm, y_norm, visibility = landmarks[mp_index]
        px = x1 + int(round(x_norm * roi_w))
        py = y1 + int(round(y_norm * roi_h))
        coco.append((px, py, float(visibility)))
    return tuple(coco)


class PoseEstimator(Protocol):
    """One RGB ROI in → 33 raw ``(x_norm, y_norm, visibility)`` landmarks out.

    The injection seam for :class:`demo.model_modules.MediaPipePoseModule` so
    unit tests drive it with a scripted estimator and never import mediapipe.
    """

    def infer(self, roi_rgb: object) -> list[tuple[float, float, float]] | None: ...


# MediaPipe ships the PoseLandmarker graph as a downloadable ``.task`` bundle
# (the legacy ``mp.solutions.pose`` API is gone in current wheels). It is cached
# alongside the YOLO pose weights under ml/models/pose/ (gitignored), and
# re-downloaded on demand — analogous to ultralytics auto-download.
POSE_LANDMARKER_DIR: Final = Path(__file__).resolve().parent.parent / "models" / "pose"
POSE_LANDMARKER_FILENAME: Final = "pose_landmarker_lite.task"
POSE_LANDMARKER_URL: Final = (
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
    "pose_landmarker_lite/float16/latest/pose_landmarker_lite.task"
)


def ensure_pose_landmarker_model(target_dir: Path = POSE_LANDMARKER_DIR) -> Path:
    """Return the cached PoseLandmarker ``.task`` path, downloading it when absent."""
    target_dir.mkdir(parents=True, exist_ok=True)
    path = target_dir / POSE_LANDMARKER_FILENAME
    if not path.is_file():
        urlretrieve(POSE_LANDMARKER_URL, path)  # noqa: S310 (trusted Google MediaPipe CDN)
    return path


class MediaPipePoseEstimator:
    """Lazy MediaPipe PoseLandmarker wrapper: one RGB ROI in → 33 landmarks out.

    Uses the MediaPipe **Tasks** vision API (``PoseLandmarker``) in IMAGE mode —
    the per-ROI crop already isolates one person, so single-image detection with
    ``num_poses=1`` is the right granularity. ``mediapipe`` is imported and the
    graph built only here, so importing this module (e.g. for the remap unit
    tests) stays free of the native dep.
    """

    def __init__(
        self, min_detection_confidence: float = 0.5, model_path: Path | None = None
    ) -> None:
        import mediapipe as mp
        from mediapipe.tasks import python as mp_python
        from mediapipe.tasks.python import vision

        path = model_path if model_path is not None else ensure_pose_landmarker_model()
        options = vision.PoseLandmarkerOptions(
            base_options=mp_python.BaseOptions(model_asset_path=str(path)),
            running_mode=vision.RunningMode.IMAGE,
            num_poses=1,
            min_pose_detection_confidence=min_detection_confidence,
            min_pose_presence_confidence=min_detection_confidence,
        )
        self._mp = mp
        self._landmarker = vision.PoseLandmarker.create_from_options(options)

    def infer(self, roi_rgb: object) -> list[tuple[float, float, float]] | None:
        """Return 33 ``(x_norm, y_norm, visibility)`` landmarks, or None if no pose.

        ``roi_rgb`` must be a contiguous RGB ``HxWx3`` uint8 array. The demo
        frame source already yields RGB frames, so the YOLO crop is RGB — no
        color conversion is applied here (a BGR2RGB swap would mirror the pose).
        """
        import numpy as np

        mp_image = self._mp.Image(
            image_format=self._mp.ImageFormat.SRGB, data=np.ascontiguousarray(roi_rgb)
        )
        result = self._landmarker.detect(mp_image)
        if not result.pose_landmarks:
            return None
        return [(lm.x, lm.y, lm.visibility) for lm in result.pose_landmarks[0]]
