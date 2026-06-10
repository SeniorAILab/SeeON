"""Tests for yolo_overlay cv2 caption rendering with English labels."""

from __future__ import annotations

import numpy as np

from demo.seam import (
    FALL_LABEL_TEXT,
    NORMAL_LABEL_TEXT,
    BoundingBox,
    DetectionLabel,
    DetectionResult,
)
from demo.yolo_overlay import render_yolo_overlay

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _blank_frame(width: int = 320, height: int = 240) -> np.ndarray:
    return np.zeros((height, width, 3), dtype=np.uint8)


def _result_with_label(text: str, is_fall: bool) -> DetectionResult:
    box = BoundingBox(x1=50, y1=50, x2=150, y2=150, confidence=0.9)
    label = DetectionLabel(text=text, confidence=0.9, is_fall=is_fall)
    return DetectionResult(boxes=(box,), labels=(label,), keypoints=((),))


# ---------------------------------------------------------------------------
# cv2 path — English labels
# ---------------------------------------------------------------------------


def test_fall_label_returns_ndarray_without_exception() -> None:
    frame = _blank_frame()
    result = render_yolo_overlay(frame, _result_with_label(FALL_LABEL_TEXT, is_fall=True))
    assert isinstance(result, np.ndarray)
    assert result.shape == frame.shape
    assert result.dtype == np.uint8


def test_normal_label_returns_ndarray_without_exception() -> None:
    frame = _blank_frame()
    result = render_yolo_overlay(frame, _result_with_label(NORMAL_LABEL_TEXT, is_fall=False))
    assert isinstance(result, np.ndarray)
    assert result.shape == frame.shape
    assert result.dtype == np.uint8


def test_fall_label_caption_region_differs_from_no_box_render() -> None:
    """cv2 path draws visible output: caption pixels must change vs no-box render."""
    frame = _blank_frame()
    with_boxes = render_yolo_overlay(
        frame, _result_with_label(FALL_LABEL_TEXT, is_fall=True), show_boxes=True, show_pose=False
    )
    without_boxes = render_yolo_overlay(
        frame, _result_with_label(FALL_LABEL_TEXT, is_fall=True), show_boxes=False, show_pose=False
    )
    assert not np.array_equal(with_boxes, without_boxes)


def test_normal_label_caption_region_differs_from_no_box_render() -> None:
    """Normal label also produces visible caption output."""
    frame = _blank_frame()
    with_boxes = render_yolo_overlay(
        frame,
        _result_with_label(NORMAL_LABEL_TEXT, is_fall=False),
        show_boxes=True,
        show_pose=False,
    )
    without_boxes = render_yolo_overlay(
        frame,
        _result_with_label(NORMAL_LABEL_TEXT, is_fall=False),
        show_boxes=False,
        show_pose=False,
    )
    assert not np.array_equal(with_boxes, without_boxes)
