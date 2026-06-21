from __future__ import annotations

from typing import Final

import cv2
import numpy as np
from numpy.typing import NDArray

from contracts.observation import BoundingBox, DetectionLabel, FrameObservation

FALL_BOX_COLOR: Final = (255, 64, 64)
DETECTION_BOX_COLOR: Final = (64, 220, 120)
BED_EMPTY_COLOR: Final = (180, 180, 180)
BED_OCCUPIED_COLOR: Final = (80, 160, 255)
BED_EXIT_COLOR: Final = (255, 180, 32)
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
    result: FrameObservation,
    show_boxes: bool = True,
    show_pose: bool = True,
) -> NDArray[np.uint8]:
    """Render bounding boxes and/or pose skeleton from a normalised FrameObservation.

    ``show_boxes`` and ``show_pose`` are independent: any of the four
    combinations renders correctly. With both off, a clean copy of the input
    frame is returned.
    """
    overlay = frame.copy()
    if show_boxes:
        for box, label in zip(result.boxes, result.labels, strict=True):
            _draw_detection_box(overlay=overlay, box=box, label=label)
        for status in result.bed_exit_statuses:
            _draw_bed_status(overlay=overlay, status=status)
    if show_pose:
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


def _draw_bed_status(overlay: NDArray[np.uint8], status: object) -> None:
    box = status.box
    occupancy = status.occupancy
    bed_id = status.bed_id
    person_id = getattr(status, "person_id", None)
    color = (
        BED_EXIT_COLOR
        if occupancy == "exit"
        else BED_OCCUPIED_COLOR
        if occupancy == "occupied"
        else BED_EMPTY_COLOR
    )
    polygon = getattr(box, "polygon", None)
    if polygon:
        contour = np.array(polygon, dtype=np.int32).reshape(-1, 1, 2)
        cv2.polylines(overlay, [contour], isClosed=True, color=color, thickness=2)
    else:
        cv2.rectangle(overlay, (box.x1, box.y1), (box.x2, box.y2), color, 2)
    suffix = f" P{person_id}" if person_id is not None else ""
    _draw_caption(
        overlay=overlay,
        text=f"BED {bed_id} {occupancy}{suffix}",
        x=box.x1,
        y=box.y2,
        color=color,
    )


def _draw_caption(
    overlay: NDArray[np.uint8],
    text: str,
    x: int,
    y: int,
    color: tuple[int, int, int],
) -> None:
    """Draw a caption box + text using cv2.putText."""
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
        if start_point[2] < MIN_KEYPOINT_CONFIDENCE or end_point[2] < MIN_KEYPOINT_CONFIDENCE:
            continue
        cv2.line(overlay, start_point[:2], end_point[:2], color, 2)
    for x, y, confidence in keypoints:
        if confidence >= MIN_KEYPOINT_CONFIDENCE:
            cv2.circle(overlay, (x, y), 3, color, -1)
