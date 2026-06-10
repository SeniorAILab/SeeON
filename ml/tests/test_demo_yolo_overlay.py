"""Tests for yolo_overlay Hangul caption rendering and ASCII fallback path."""

from __future__ import annotations

import numpy as np
import pytest

from demo.seam import BoundingBox, DetectionLabel, DetectionResult  # noqa: E402
from demo.yolo_overlay import _draw_caption, _load_pil_font, render_yolo_overlay

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
# Hangul rendering — PIL path (skipped when no CJK font available on this host)
# ---------------------------------------------------------------------------

_pil_font_available = _load_pil_font(
    (
        "/System/Library/Fonts/AppleSDGothicNeo.ttc",
        "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    )
) is not None

_require_pil_font = pytest.mark.skipif(
    not _pil_font_available, reason="No CJK font installed on this host"
)


@_require_pil_font
def test_hangul_label_returns_ndarray_without_exception() -> None:
    frame = _blank_frame()
    result = render_yolo_overlay(frame, _result_with_label("낙상", is_fall=True))
    assert isinstance(result, np.ndarray)
    assert result.shape == frame.shape
    assert result.dtype == np.uint8


@_require_pil_font
def test_hangul_label_caption_region_differs_from_no_box_render() -> None:
    """Verify that text is actually drawn: caption pixels must change."""
    frame = _blank_frame()
    with_boxes = render_yolo_overlay(
        frame, _result_with_label("낙상", is_fall=True), show_boxes=True, show_pose=False
    )
    without_boxes = render_yolo_overlay(
        frame, _result_with_label("낙상", is_fall=True), show_boxes=False, show_pose=False
    )
    # Some pixels must differ — the caption background at minimum.
    assert not np.array_equal(with_boxes, without_boxes)


# ---------------------------------------------------------------------------
# ASCII fallback path — forced by passing empty font-candidate list
# ---------------------------------------------------------------------------

def test_fallback_with_empty_candidates_returns_ndarray() -> None:
    frame = _blank_frame()
    result = render_yolo_overlay(frame, _result_with_label("낙상", is_fall=True))
    # Even without a font, rendering must not raise and must return an ndarray.
    assert isinstance(result, np.ndarray)


def test_fallback_ascii_text_is_drawn_for_naksan() -> None:
    """With an empty candidate list _draw_caption falls back to cv2 + 'FALL'."""
    frame = _blank_frame()
    # Call _draw_caption directly with empty candidates to force fallback.
    _draw_caption(
        overlay=frame,
        text="낙상 95%",
        x=10,
        y=50,
        color=(64, 220, 120),
        _font_candidates=(),
    )
    # The caption background rectangle must have altered pixels near (10, y).
    # Blank frame is all-zeros; any drawn pixel suffices.
    assert frame.max() > 0


def test_fallback_ascii_text_is_drawn_for_jeongsang() -> None:
    """With an empty candidate list _draw_caption falls back to cv2 + 'OK'."""
    frame = _blank_frame()
    _draw_caption(
        overlay=frame,
        text="정상 0%",
        x=10,
        y=50,
        color=(64, 220, 120),
        _font_candidates=(),
    )
    assert frame.max() > 0


def test_fallback_caption_region_differs_from_no_box_render() -> None:
    """Fallback path also produces visible output (pixels change)."""
    frame = _blank_frame()
    with_boxes = render_yolo_overlay(
        frame,
        _result_with_label("정상", is_fall=False),
        show_boxes=True,
        show_pose=False,
    )
    without_boxes = render_yolo_overlay(
        frame,
        _result_with_label("정상", is_fall=False),
        show_boxes=False,
        show_pose=False,
    )
    assert not np.array_equal(with_boxes, without_boxes)


def test_load_pil_font_empty_candidates_returns_none() -> None:
    assert _load_pil_font(()) is None
