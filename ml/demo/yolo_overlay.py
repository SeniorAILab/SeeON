from __future__ import annotations

import functools
from pathlib import Path
from typing import Final

import cv2
import numpy as np
from numpy.typing import NDArray

from demo.seam import BoundingBox, DetectionLabel, DetectionResult

FALL_BOX_COLOR: Final = (255, 64, 64)
DETECTION_BOX_COLOR: Final = (64, 220, 120)
CAPTION_TEXT_COLOR: Final = (16, 16, 16)
CAPTION_FONT_SCALE: Final = 0.5
CAPTION_THICKNESS: Final = 1
CAPTION_FONT_SIZE: Final = 14

# Hangul-capable font candidates tried in order; first existing path wins.
_HANGUL_FONT_CANDIDATES: Final[tuple[str, ...]] = (
    "/System/Library/Fonts/AppleSDGothicNeo.ttc",  # macOS
    "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",  # Linux (nanum)
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",  # Linux (noto)
)

# ASCII fallback text used when no Hangul font is available.
_HANGUL_ASCII_FALLBACK: Final[dict[str, str]] = {"낙상": "FALL", "정상": "OK"}

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


@functools.lru_cache(maxsize=8)
def _load_pil_font(candidates: tuple[str, ...]) -> object | None:
    """Return PIL ImageFont for the first existing font candidate, or None.

    Cached by the candidates tuple so tests can supply an empty tuple to force
    the ASCII fallback path without invalidating the production cache entry.
    """
    try:
        from PIL import ImageFont  # noqa: PLC0415

        for path in candidates:
            if Path(path).exists():
                return ImageFont.truetype(path, size=CAPTION_FONT_SIZE)
    except Exception:  # noqa: BLE001
        return None
    return None


def _ascii_fallback_text(text: str) -> str:
    """Replace a known Hangul label prefix with its ASCII equivalent."""
    for hangul, ascii_ in _HANGUL_ASCII_FALLBACK.items():
        if text.startswith(hangul):
            return ascii_ + text[len(hangul):]
    return text


def render_yolo_overlay(
    frame: NDArray[np.uint8],
    result: DetectionResult,
    show_boxes: bool = True,
    show_pose: bool = True,
) -> NDArray[np.uint8]:
    """Render bounding boxes and/or pose skeleton from a normalised DetectionResult.

    ``show_boxes`` and ``show_pose`` are independent: any of the four
    combinations renders correctly. With both off, a clean copy of the input
    frame is returned.
    """
    overlay = frame.copy()
    if show_boxes:
        for box, label in zip(result.boxes, result.labels, strict=True):
            _draw_detection_box(overlay=overlay, box=box, label=label)
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


def _draw_caption(
    overlay: NDArray[np.uint8],
    text: str,
    x: int,
    y: int,
    color: tuple[int, int, int],
    _font_candidates: tuple[str, ...] = _HANGUL_FONT_CANDIDATES,
) -> None:
    """Draw a caption box + text.  Uses PIL for Hangul; falls back to cv2 + ASCII."""
    font = _load_pil_font(_font_candidates)
    if font is not None:
        _draw_caption_pil(overlay, text, x, y, color, font)
    else:
        _draw_caption_cv2(overlay, _ascii_fallback_text(text), x, y, color)


def _draw_caption_pil(
    overlay: NDArray[np.uint8],
    text: str,
    x: int,
    y: int,
    color: tuple[int, int, int],
    font: object,
) -> None:
    """Draw caption using PIL so Hangul codepoints are rendered correctly."""
    from PIL import Image, ImageDraw  # noqa: PLC0415

    # OpenCV stores frames as BGR; PIL expects RGB.
    img = Image.fromarray(cv2.cvtColor(overlay, cv2.COLOR_BGR2RGB))
    draw = ImageDraw.Draw(img)

    # Convert BGR color constants to RGB for PIL.
    pil_color = (color[2], color[1], color[0])
    pil_text_color = (
        CAPTION_TEXT_COLOR[2],
        CAPTION_TEXT_COLOR[1],
        CAPTION_TEXT_COLOR[0],
    )

    # Measure text to size the background rectangle.
    bbox = draw.textbbox((x + 2, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]

    top = max(y - text_h - 6, 0)
    draw.rectangle((x, top, x + text_w + 4, top + text_h + 4), fill=pil_color)
    draw.text((x + 2, top + 2), text, font=font, fill=pil_text_color)

    overlay[:] = cv2.cvtColor(np.asarray(img), cv2.COLOR_RGB2BGR)


def _draw_caption_cv2(
    overlay: NDArray[np.uint8],
    text: str,
    x: int,
    y: int,
    color: tuple[int, int, int],
) -> None:
    """Draw caption using cv2.putText (ASCII/Latin only)."""
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
