from __future__ import annotations

from typing import Final

import cv2
import numpy as np
from numpy.typing import NDArray

try:
    from demo.seam import BoundingBox, DetectionLabel, DetectionResult
except ModuleNotFoundError:
    from seam import BoundingBox, DetectionLabel, DetectionResult  # type: ignore[no-redef]

FALL_BOX_COLOR: Final = (255, 64, 64)
DETECTION_BOX_COLOR: Final = (64, 220, 120)
CAPTION_TEXT_COLOR: Final = (16, 16, 16)
CAPTION_FONT_SCALE: Final = 0.5
CAPTION_THICKNESS: Final = 1

POSE_EDGES: Final[tuple[tuple[int, int], ...]] = (
    (0, 1),
    (0, 2),
    (1, 3),
    (2, 4),
    (5, 6),
    (5, 7),
    (7, 9),
    (6, 8),
    (8, 10),
    (5, 11),
    (6, 12),
    (11, 12),
    (11, 13),
    (13, 15),
    (12, 14),
    (14, 16),
)
MIN_KEYPOINT_CONFIDENCE: Final = 0.2


def render_yolo_overlay(
    frame: NDArray[np.uint8],
    result: DetectionResult,
) -> NDArray[np.uint8]:
    """Render bounding boxes and pose skeleton from a normalised DetectionResult."""
    overlay = frame.copy()
    for box, label in zip(result.boxes, result.labels):
        _draw_detection_box(overlay=overlay, box=box, label=label)
    for pose in result.keypoints:
        _draw_pose(overlay=overlay, keypoints=pose)
    return overlay


def _draw_detection_box(
    overlay: NDArray[np.uint8],
    box: BoundingBox,
    label: DetectionLabel,
) -> None:
    color = FALL_BOX_COLOR if label.is_fall else DETECTION_BOX_COLOR
    cv2.rectangle(overlay, (box.x1, box.y1), (box.x2, box.y2), color, 2)
    _draw_caption(
        overlay=overlay,
        text=f"{label.text} {label.confidence:.0%}",
        x=box.x1,
        y=box.y1,
        color=color,
    )


def _draw_caption(
    overlay: NDArray[np.uint8],
    text: str,
    x: int,
    y: int,
    color: tuple[int, int, int],
) -> None:
    (text_width, text_height), baseline = cv2.getTextSize(
        text, cv2.FONT_HERSHEY_SIMPLEX, CAPTION_FONT_SCALE, CAPTION_THICKNESS
    )
    top = max(y - text_height - baseline - 2, 0)
    cv2.rectangle(
        overlay,
        (x, top),
        (x + text_width + 2, top + text_height + baseline + 2),
        color,
        -1,
    )
    cv2.putText(
        overlay,
        text,
        (x + 1, top + text_height + 1),
        cv2.FONT_HERSHEY_SIMPLEX,
        CAPTION_FONT_SCALE,
        CAPTION_TEXT_COLOR,
        CAPTION_THICKNESS,
        cv2.LINE_AA,
    )


def _draw_pose(
    overlay: NDArray[np.uint8],
    keypoints: tuple[tuple[int, int, float], ...],
) -> None:
    color = (80, 160, 255)
    for start, end in POSE_EDGES:
        if start >= len(keypoints) or end >= len(keypoints):
            continue
        start_point = keypoints[start]
        end_point = keypoints[end]
        if (
            start_point[2] < MIN_KEYPOINT_CONFIDENCE
            or end_point[2] < MIN_KEYPOINT_CONFIDENCE
        ):
            continue
        cv2.line(overlay, start_point[:2], end_point[:2], color, 2)
    for x, y, confidence in keypoints:
        if confidence >= MIN_KEYPOINT_CONFIDENCE:
            cv2.circle(overlay, (x, y), 3, color, -1)
