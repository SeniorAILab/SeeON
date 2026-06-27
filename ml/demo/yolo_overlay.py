from __future__ import annotations

import numpy as np
from numpy.typing import NDArray

from contracts.observation import BoundingBox, DetectionLabel, FrameObservation
from perception.overlay_renderer import (
    BED_EMPTY_COLOR,
    BED_EXIT_COLOR,
    BED_OCCUPIED_COLOR,
    DETECTION_BOX_COLOR,
    FALL_BOX_COLOR,
    draw_box,
    draw_caption,
    draw_pose,
    draw_region,
)


def render_yolo_overlay(
    frame: NDArray[np.uint8],
    result: FrameObservation,
    show_boxes: bool = True,
    show_pose: bool = True,
) -> NDArray[np.uint8]:
    """Render bounding boxes and/or pose skeleton from a normalised FrameObservation.

    ``show_boxes`` and ``show_pose`` are independent: any of the four
    combinations renders correctly. With both off, a clean copy of the input
    frame is returned. Drawing primitives are shared with the worker dev overlay
    via ``perception.overlay_renderer`` (single source of truth).
    """
    overlay = frame.copy()
    if show_boxes:
        for box, label in zip(result.boxes, result.labels, strict=True):
            _draw_detection_box(overlay, box, label)
        for status in result.bed_exit_statuses:
            _draw_bed_status(overlay, status)
    if show_pose:
        for pose in result.keypoints:
            draw_pose(overlay, pose)
    return overlay


def _draw_detection_box(
    overlay: NDArray[np.uint8],
    box: BoundingBox,
    label: DetectionLabel,
) -> None:
    color = FALL_BOX_COLOR if label.is_fall else DETECTION_BOX_COLOR
    draw_box(overlay, box, color)
    draw_caption(overlay, f"{label.text} {label.confidence:.0%}", box.x1, box.y1, color)


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
    draw_region(overlay, box, color)
    suffix = f" P{person_id}" if person_id is not None else ""
    draw_caption(overlay, f"BED {bed_id} {occupancy}{suffix}", box.x1, box.y2, color)
