from __future__ import annotations

from dataclasses import dataclass

from core.contract import FrameObservation

# COCO-17 keypoint indices used for torso orientation
_LEFT_SHOULDER = 5
_RIGHT_SHOULDER = 6
_LEFT_HIP = 11
_RIGHT_HIP = 12
_CONF_THRESHOLD = 0.2


@dataclass(frozen=True, slots=True)
class FrameFeatures:
    has_person: bool
    aspect_ratio: float  # primary person box width/height; >1 = wide (lying)
    vertical_center: float  # box center_y / frame_height in [0,1]; larger = lower (toward floor)
    box_height_ratio: float  # box height / frame_height
    torso_vertical: float  # |shoulder_mid_y - hip_mid_y| / frame_height; small = horizontal


_NO_PERSON = FrameFeatures(
    has_person=False,
    aspect_ratio=0.0,
    vertical_center=0.0,
    box_height_ratio=0.0,
    torso_vertical=0.0,
)


def extract_frame_features(
    result: FrameObservation, frame_height: int, frame_width: int
) -> FrameFeatures:
    """Extract pose-based fall-risk features from a single FrameObservation.

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
            (result.boxes[i].x2 - result.boxes[i].x1) * (result.boxes[i].y2 - result.boxes[i].y1)
        ),
    )
    box = result.boxes[best_idx]

    width = box.x2 - box.x1
    height = box.y2 - box.y1
    center_y = (box.y1 + box.y2) / 2.0

    aspect_ratio = (width / height) if height > 0 else 0.0
    vertical_center = center_y / frame_height
    box_height_ratio = height / frame_height

    # Torso vertical: |shoulder_mid_y - hip_mid_y| / frame_height
    # Only uses keypoints with confidence >= _CONF_THRESHOLD
    torso_vertical = 0.0
    if best_idx < len(result.keypoints):
        kpts = result.keypoints[best_idx]
        shoulder_ys: list[float] = []
        for idx in (_LEFT_SHOULDER, _RIGHT_SHOULDER):
            if idx < len(kpts) and kpts[idx][2] >= _CONF_THRESHOLD:
                shoulder_ys.append(float(kpts[idx][1]))
        hip_ys: list[float] = []
        for idx in (_LEFT_HIP, _RIGHT_HIP):
            if idx < len(kpts) and kpts[idx][2] >= _CONF_THRESHOLD:
                hip_ys.append(float(kpts[idx][1]))
        if shoulder_ys and hip_ys:
            shoulder_mid = sum(shoulder_ys) / len(shoulder_ys)
            hip_mid = sum(hip_ys) / len(hip_ys)
            torso_vertical = abs(shoulder_mid - hip_mid) / frame_height

    return FrameFeatures(
        has_person=True,
        aspect_ratio=aspect_ratio,
        vertical_center=vertical_center,
        box_height_ratio=box_height_ratio,
        torso_vertical=torso_vertical,
    )
