"""BedDetector one-shot bed-localization seam (issue #100, AC-16).

Stubs the inference runner so these tests carry no ultralytics dependency and
no real weight: they pin the contract that BedDetector translates a raw
``(x1,y1,x2,y2,conf)`` tuple into a BoundingBox, and degrades to ``None`` (the
graceful "침대 없음" state) when the runner reports no bed — never an exception.

The detect-once + cache requirement is a *caller* contract: BedDetector is
stateless per call, so we assert it calls the runner exactly once per detect()
and that a single seed-frame detection is all the page needs to cache the ROI.
"""

from __future__ import annotations

import numpy as np
import pytest

from demo.bed_detector import BedDetector
from demo.seam import BoundingBox, Frame


def _frame() -> Frame:
    return Frame(index=0, time_sec=0.0, image=np.zeros((4, 4, 3), dtype=np.uint8))


class _StubRunner:
    """Records calls so we can assert one-shot semantics without a real model."""

    def __init__(self, result: tuple[int, int, int, int, float] | None) -> None:
        self._result = result
        self.calls = 0

    def detect_bed(self, frame):  # noqa: ANN001 - test stub
        self.calls += 1
        return self._result


def test_detect_translates_runner_box_into_bounding_box() -> None:
    runner = _StubRunner((10, 20, 110, 220, 0.83))
    detector = BedDetector(runner=runner)

    box = detector.detect(_frame())

    assert box == BoundingBox(x1=10, y1=20, x2=110, y2=220, confidence=0.83)


def test_detect_invokes_runner_exactly_once() -> None:
    runner = _StubRunner((0, 0, 1, 1, 0.5))
    detector = BedDetector(runner=runner)

    detector.detect(_frame())

    # One seed-frame inference; the page caches the ROI and never re-detects
    # per frame (the per-frame path stays a single pose pass, ADR-005 §3).
    assert runner.calls == 1


def test_detect_returns_none_when_runner_finds_no_bed() -> None:
    runner = _StubRunner(None)
    detector = BedDetector(runner=runner)

    assert detector.detect(_frame()) is None


def test_detect_passes_frame_image_to_runner() -> None:
    captured: list[object] = []

    class _CapturingRunner:
        def detect_bed(self, frame):  # noqa: ANN001 - test stub
            captured.append(frame)
            return None

    frame = _frame()
    BedDetector(runner=_CapturingRunner()).detect(frame)

    assert len(captured) == 1
    assert captured[0] is frame.image


@pytest.mark.parametrize(
    "raw",
    [
        (0, 0, 100, 100, 1.0),
        (5, 5, 6, 6, 0.25),
    ],
)
def test_detect_preserves_runner_confidence_and_coords(
    raw: tuple[int, int, int, int, float],
) -> None:
    box = BedDetector(runner=_StubRunner(raw)).detect(_frame())
    assert box is not None
    assert (box.x1, box.y1, box.x2, box.y2, box.confidence) == raw
