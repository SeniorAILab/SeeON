"""Tests for yolo_overlay cv2 caption rendering with English labels."""

from __future__ import annotations

import numpy as np
import pytest

from core.contract import (
    FALL_LABEL_TEXT,
    NORMAL_LABEL_TEXT,
    BoundingBox,
    DetectionLabel,
    FrameObservation,
)
from demo.yolo_overlay import render_yolo_overlay

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _blank_frame(width: int = 320, height: int = 240) -> np.ndarray:
    return np.zeros((height, width, 3), dtype=np.uint8)


def _result_with_label(text: str, is_fall: bool) -> FrameObservation:
    box = BoundingBox(x1=50, y1=50, x2=150, y2=150, confidence=0.9)
    label = DetectionLabel(text=text, confidence=0.9, is_fall=is_fall)
    return FrameObservation(detections=((box,), (label,)), poses=((),), regions=((), ()))


def _result_with_pose() -> FrameObservation:
    box = BoundingBox(x1=50, y1=50, x2=150, y2=150, confidence=0.9)
    label = DetectionLabel(text=NORMAL_LABEL_TEXT, confidence=0.9, is_fall=False)
    pose = tuple((60 + i * 4, 70 + (i % 4) * 8, 0.95) for i in range(17))
    return FrameObservation(detections=((box,), (label,)), poses=(pose,), regions=((), ()))


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


@pytest.mark.parametrize(
    ("show_boxes", "show_pose", "should_match_clean"),
    [
        pytest.param(False, False, True, id="both-off-clean"),
        pytest.param(True, False, False, id="boxes-only"),
        pytest.param(False, True, False, id="pose-only"),
        pytest.param(True, True, False, id="boxes-and-pose"),
    ],
)
def test_overlay_box_pose_combinations_render_expected_clean_or_visible_output(
    show_boxes: bool, show_pose: bool, should_match_clean: bool
) -> None:
    frame = _blank_frame()
    rendered = render_yolo_overlay(
        frame,
        _result_with_pose(),
        show_boxes=show_boxes,
        show_pose=show_pose,
    )

    assert rendered is not frame
    assert rendered.shape == frame.shape
    assert np.array_equal(rendered, frame) is should_match_clean
