from __future__ import annotations

from collections.abc import Iterator

import numpy as np

from demo.live_view import iter_live_frames
from demo.seam import BoundingBox, DetectionLabel, DetectionResult, Frame


class _FakeSource:
    """Yields ``count`` synthetic frames; satisfies the FrameSource protocol."""

    def __init__(self, count: int, *, height: int = 16, width: int = 24) -> None:
        self._count = count
        self._height = height
        self._width = width

    def __iter__(self) -> Iterator[Frame]:
        for i in range(self._count):
            image = np.zeros((self._height, self._width, 3), dtype=np.uint8)
            yield Frame(index=i, time_sec=round(i * 0.5, 3), image=image)


class _ScriptedModel:
    """Returns a scripted DetectionResult per frame; fall fires on ``fall_at``."""

    def __init__(self, fall_at: int) -> None:
        self._fall_at = fall_at

    def predict(self, frame: Frame) -> DetectionResult:
        is_fall = frame.index == self._fall_at
        box = BoundingBox(x1=2, y1=2, x2=10, y2=10, confidence=0.9)
        label = DetectionLabel(
            text="fall" if is_fall else "person",
            confidence=0.95 if is_fall else 0.4,
            is_fall=is_fall,
        )
        pose = ((3, 3, 0.9),) * 17
        return DetectionResult(boxes=(box,), labels=(label,), keypoints=(pose,))


def test_iter_live_frames_yields_one_item_per_source_frame_in_order() -> None:
    items = list(iter_live_frames(_FakeSource(count=4), _ScriptedModel(fall_at=99)))

    assert len(items) == 4
    # Every item is (overlay, status, confidence) and stays 정상 (no fall scripted).
    times = [status.detail for _overlay, status, _conf in items]
    assert times == [
        "0.00s / 낙상 없음",
        "0.50s / 낙상 없음",
        "1.00s / 낙상 없음",
        "1.50s / 낙상 없음",
    ]


def test_iter_live_frames_propagates_fall_state_on_the_fall_frame() -> None:
    items = list(iter_live_frames(_FakeSource(count=3), _ScriptedModel(fall_at=1)))

    assert [status.is_fall for _overlay, status, _conf in items] == [False, True, False]
    _, fall_status, fall_conf = items[1]
    assert fall_status.label == "낙상"
    assert fall_conf == 0.95


def test_iter_live_frames_overlay_matches_input_frame_shape() -> None:
    source = _FakeSource(count=2, height=20, width=32)
    items = list(iter_live_frames(source, _ScriptedModel(fall_at=99)))

    for overlay, _status, _conf in items:
        assert overlay.shape == (20, 32, 3)
        assert overlay.dtype == np.uint8


def test_iter_live_frames_empty_source_yields_nothing() -> None:
    assert list(iter_live_frames(_FakeSource(count=0), _ScriptedModel(fall_at=0))) == []
