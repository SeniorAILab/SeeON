"""Tests for FallClassifierModule — verifies English label text output."""

from __future__ import annotations

from unittest.mock import MagicMock

import numpy as np

from core.classifier_module import FallClassifierModule
from core.classifiers import Classification
from core.contract import (
    FALL_LABEL_TEXT,
    NORMAL_LABEL_TEXT,
    BoundingBox,
    DetectionLabel,
    DetectionResult,
)
from util.frame_source import Frame


def _fake_frame(width: int = 320, height: int = 240) -> Frame:
    return Frame(index=0, time_sec=0.0, image=np.zeros((height, width, 3), dtype=np.uint8))


def _single_box_result() -> DetectionResult:
    box = BoundingBox(x1=10, y1=10, x2=110, y2=210, confidence=0.9)
    label = DetectionLabel(text="person", confidence=0.9, is_fall=False)
    return DetectionResult(boxes=(box,), labels=(label,), keypoints=((),))


def _make_module(is_fall: bool, confidence: float = 1.0) -> FallClassifierModule:
    pose_module = MagicMock()
    pose_module.predict.return_value = _single_box_result()

    classifier = MagicMock()
    classifier.update.return_value = Classification(
        is_fall=is_fall,
        confidence=confidence,
        label="fall" if is_fall else "no-fall",
    )
    return FallClassifierModule(pose_module, classifier)


def test_fall_label_is_fall() -> None:
    module = _make_module(is_fall=True)
    result = module.predict(_fake_frame())
    assert result.labels[0].text == FALL_LABEL_TEXT


def test_nonfall_label_is_normal() -> None:
    module = _make_module(is_fall=False)
    result = module.predict(_fake_frame())
    assert result.labels[0].text == NORMAL_LABEL_TEXT


def test_fall_label_carries_is_fall_true() -> None:
    module = _make_module(is_fall=True)
    result = module.predict(_fake_frame())
    assert result.labels[0].is_fall is True


def test_nonfal_label_carries_is_fall_false() -> None:
    module = _make_module(is_fall=False)
    result = module.predict(_fake_frame())
    assert result.labels[0].is_fall is False


def test_nonprimary_persons_keep_person_text() -> None:
    """Secondary detection boxes remain labelled 'person' (detection, not classification)."""
    box_a = BoundingBox(x1=0, y1=0, x2=100, y2=200, confidence=0.9)  # larger → primary
    box_b = BoundingBox(x1=200, y1=0, x2=250, y2=50, confidence=0.8)  # smaller → secondary

    label = DetectionLabel(text="person", confidence=0.8, is_fall=False)
    pose_result = DetectionResult(
        boxes=(box_a, box_b),
        labels=(label, label),
        keypoints=((), ()),
    )

    pose_module = MagicMock()
    pose_module.predict.return_value = pose_result

    classifier = MagicMock()
    classifier.update.return_value = Classification(is_fall=True, confidence=1.0, label="fall")

    module = FallClassifierModule(pose_module, classifier)
    result = module.predict(_fake_frame())

    # Primary (box_a) → FALL_LABEL_TEXT; secondary (box_b) → 'person'
    assert result.labels[0].text == FALL_LABEL_TEXT
    assert result.labels[1].text == "person"
