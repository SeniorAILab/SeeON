from __future__ import annotations

from collections.abc import Sequence
from typing import Final

import cv2
import numpy as np
from numpy.typing import NDArray

try:
    from demo.yolo_runtime import PoseDetections, PoseKeypoints, YoloFrameAnalysis
except ModuleNotFoundError:
    from yolo_runtime import PoseDetections, PoseKeypoints, YoloFrameAnalysis

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
    analyses: Sequence[YoloFrameAnalysis],
    poses: PoseDetections,
) -> NDArray[np.uint8]:
    overlay = frame.copy()
    for pose in poses:
        _draw_pose(overlay=overlay, keypoints=pose)
    return overlay


def _draw_pose(
    overlay: NDArray[np.uint8],
    keypoints: PoseKeypoints,
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
