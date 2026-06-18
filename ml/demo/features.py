from __future__ import annotations

import math
from dataclasses import dataclass

from demo.seam import DetectionResult

# COCO-17 keypoint indices used for torso orientation
_LEFT_SHOULDER = 5
_RIGHT_SHOULDER = 6
_LEFT_HIP = 11
_RIGHT_HIP = 12
_CONF_THRESHOLD = 0.2

# Torso angle when the pose is missing/degenerate: 90° = upright. The pose-angle
# fall classifier treats near-horizontal torsos as lying, so defaulting to
# upright means "no pose ⇒ no fall signal" rather than a false positive.
_UPRIGHT_ANGLE_DEG = 90.0


@dataclass(frozen=True, slots=True)
class FrameFeatures:
    has_person: bool
    aspect_ratio: float  # primary person box width/height; >1 = wide (lying)
    vertical_center: float  # box center_y / frame_height in [0,1]; larger = lower (toward floor)
    box_height_ratio: float  # box height / frame_height
    torso_vertical: float  # |shoulder_mid_y - hip_mid_y| / frame_height; small = horizontal
    # Angle of the shoulder-mid→hip-mid vector from the horizontal axis, in
    # degrees [0, 90]. ~90 = torso upright (standing); ~0 = torso flat (lying).
    # Scale-invariant (unlike torso_vertical), so it is the signal the
    # YOLO+MediaPipe pose-angle classifier uses to judge falls (issue #218).
    torso_angle_deg: float = _UPRIGHT_ANGLE_DEG


_NO_PERSON = FrameFeatures(
    has_person=False,
    aspect_ratio=0.0,
    vertical_center=0.0,
    box_height_ratio=0.0,
    torso_vertical=0.0,
    torso_angle_deg=_UPRIGHT_ANGLE_DEG,
)


def _mid_point(
    kpts: tuple[tuple[int, int, float], ...], indices: tuple[int, int]
) -> tuple[float, float] | None:
    """Average the confident keypoints among ``indices`` into one (x, y) point.

    Returns ``None`` when neither keypoint clears ``_CONF_THRESHOLD`` so callers
    skip torso math instead of trusting a phantom point at the origin.
    """
    xs: list[float] = []
    ys: list[float] = []
    for idx in indices:
        if idx < len(kpts) and kpts[idx][2] >= _CONF_THRESHOLD:
            xs.append(float(kpts[idx][0]))
            ys.append(float(kpts[idx][1]))
    if not xs:
        return None
    return sum(xs) / len(xs), sum(ys) / len(ys)


def extract_frame_features(
    result: DetectionResult, frame_height: int, frame_width: int
) -> FrameFeatures:
    """Extract pose-based fall-risk features from a single DetectionResult.

    Picks the largest-area bounding box as the primary person and aligns its
    index with ``result.keypoints``. Returns a zero-filled FrameFeatures with
    ``has_person=False`` when no boxes are present or frame dimensions are
    degenerate (height <= 0).
    """
    if not result.boxes or frame_height <= 0:
        return _NO_PERSON

    best_idx = max(
        range(len(result.boxes)),
        key=lambda i: (
            (result.boxes[i].x2 - result.boxes[i].x1)
            * (result.boxes[i].y2 - result.boxes[i].y1)
        ),
    )
    box = result.boxes[best_idx]

    width = box.x2 - box.x1
    height = box.y2 - box.y1
    center_y = (box.y1 + box.y2) / 2.0

    aspect_ratio = (width / height) if height > 0 else 0.0
    vertical_center = center_y / frame_height
    box_height_ratio = height / frame_height

    # Torso geometry from the shoulder-mid and hip-mid points (confident
    # keypoints only). torso_vertical keeps its frame-normalized magnitude;
    # torso_angle_deg is the scale-invariant inclination from horizontal.
    torso_vertical = 0.0
    torso_angle_deg = _UPRIGHT_ANGLE_DEG
    if best_idx < len(result.keypoints):
        kpts = result.keypoints[best_idx]
        shoulder_mid = _mid_point(kpts, (_LEFT_SHOULDER, _RIGHT_SHOULDER))
        hip_mid = _mid_point(kpts, (_LEFT_HIP, _RIGHT_HIP))
        if shoulder_mid is not None and hip_mid is not None:
            dx = abs(hip_mid[0] - shoulder_mid[0])
            dy = abs(hip_mid[1] - shoulder_mid[1])
            torso_vertical = dy / frame_height
            # atan2(0, 0) == 0 would read a coincident shoulder/hip as "flat";
            # treat that degenerate case as upright instead.
            if dx > 0.0 or dy > 0.0:
                torso_angle_deg = math.degrees(math.atan2(dy, dx))

    return FrameFeatures(
        has_person=True,
        aspect_ratio=aspect_ratio,
        vertical_center=vertical_center,
        box_height_ratio=box_height_ratio,
        torso_vertical=torso_vertical,
        torso_angle_deg=torso_angle_deg,
    )
