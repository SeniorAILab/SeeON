from __future__ import annotations

from collections.abc import Iterator

import numpy as np

from core.bed_exit import BedExitEvent
from core.playback_status import CurrentPlaybackStatus
from core.seam import BoundingBox, DetectionLabel, DetectionResult, Frame
from demo.live_view import BedExitLatch, FallEventLatch, iter_live_frames, render_due


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


class _BedDetector:
    def detect(self, _frame: Frame) -> tuple[BoundingBox, ...]:
        return (BoundingBox(x1=0, y1=0, x2=12, y2=12, confidence=0.8),)


class _TwoBedDetector:
    def detect(self, _frame: Frame) -> tuple[BoundingBox, ...]:
        return (
            BoundingBox(x1=0, y1=0, x2=12, y2=12, confidence=0.8),
            BoundingBox(x1=12, y1=0, x2=24, y2=12, confidence=0.8),
        )


class _BedExitScriptedModel:
    def predict(self, frame: Frame) -> DetectionResult:
        boxes = (
            BoundingBox(x1=2, y1=2, x2=10, y2=10, confidence=0.9),
            BoundingBox(x1=2, y1=2, x2=10, y2=10, confidence=0.9),
            BoundingBox(x1=6, y1=2, x2=14, y2=10, confidence=0.9),
            BoundingBox(x1=10, y1=2, x2=18, y2=10, confidence=0.9),
            BoundingBox(x1=10, y1=2, x2=18, y2=10, confidence=0.9),
            BoundingBox(x1=10, y1=2, x2=18, y2=10, confidence=0.9),
            BoundingBox(x1=10, y1=2, x2=18, y2=10, confidence=0.9),
        )
        box = boxes[frame.index]
        label = DetectionLabel(text="person", confidence=0.4, is_fall=False)
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


def test_iter_live_frames_surfaces_bed_exit_events() -> None:
    items = list(
        iter_live_frames(
            _FakeSource(count=7),
            _BedExitScriptedModel(),
            bed_detector=_BedDetector(),
        )
    )

    event_counts = [status.bed_exit_event_count for _overlay, status, _conf in items]
    assert event_counts == [0, 0, 0, 0, 0, 0, 1]
    _, exit_status, _ = items[-1]
    assert exit_status.first_bed_exit_sec == 3.0
    assert exit_status.bed_exit_events == (BedExitEvent(person_id=0, bed_id=0),)


def test_iter_live_frames_surfaces_bed_count() -> None:
    with_beds = list(
        iter_live_frames(
            _FakeSource(count=2),
            _ScriptedModel(fall_at=99),
            bed_detector=_TwoBedDetector(),
        )
    )
    without_beds = list(iter_live_frames(_FakeSource(count=2), _ScriptedModel(fall_at=99)))

    assert [status.bed_count for _overlay, status, _conf in with_beds] == [2, 2]
    assert [status.bed_count for _overlay, status, _conf in without_beds] == [0, 0]


def test_current_playback_status_bed_count_defaults_to_zero() -> None:
    status = CurrentPlaybackStatus(
        label="정상",
        detail="0.00s / 낙상 없음",
        pose_label="포즈 대기",
        pose_count=0,
        is_fall=False,
    )

    assert status.bed_count == 0


class TestRenderDue:
    def test_paints_every_stride_th_frame(self) -> None:
        due = [render_due(n, 4, is_fall=False, last_painted_fall=False) for n in range(1, 9)]
        assert due == [False, False, False, True, False, False, False, True]

    def test_fall_onset_paints_immediately(self) -> None:
        # Frame 5 with stride 4 would normally be skipped — fall onset forces it.
        assert render_due(5, 4, is_fall=True, last_painted_fall=False) is True

    def test_fall_clear_paints_immediately(self) -> None:
        assert render_due(5, 4, is_fall=False, last_painted_fall=True) is True

    def test_steady_fall_state_keeps_decimating(self) -> None:
        assert render_due(5, 4, is_fall=True, last_painted_fall=True) is False
        assert render_due(8, 4, is_fall=True, last_painted_fall=True) is True

    def test_stride_one_paints_everything(self) -> None:
        assert all(render_due(n, 1, is_fall=False, last_painted_fall=False) for n in range(1, 5))


class TestFallEventLatch:
    def test_no_fall_no_event(self) -> None:
        latch = FallEventLatch()
        assert not any(latch.update(False, t * 0.1) for t in range(10))
        assert latch.event_count == 0
        assert latch.first_event_sec is None

    def test_single_onset_records_time_and_counts_once(self) -> None:
        latch = FallEventLatch()
        signal = [False, False, True, True, True, False]
        onsets = [latch.update(s, i * 0.5) for i, s in enumerate(signal)]
        assert onsets == [False, False, True, False, False, False]
        assert latch.event_count == 1
        assert latch.first_event_sec == 1.0

    def test_reentry_counts_new_event_keeps_first_time(self) -> None:
        latch = FallEventLatch()
        signal = [False, True, False, False, True, True]
        for i, s in enumerate(signal):
            latch.update(s, float(i))
        assert latch.event_count == 2
        assert latch.first_event_sec == 1.0

    def test_fall_on_first_frame_is_an_onset(self) -> None:
        latch = FallEventLatch()
        assert latch.update(True, 0.0) is True
        assert latch.first_event_sec == 0.0


class TestBedExitLatch:
    def test_no_bed_exit_no_event(self) -> None:
        latch = BedExitLatch()
        assert latch.update((), 0.0) == ()
        assert latch.event_count == 0
        assert latch.first_event_sec is None

    def test_single_onset_records_time_and_counts_once(self) -> None:
        latch = BedExitLatch()
        event = BedExitEvent(person_id=7, bed_id=2)

        onsets = [
            latch.update((), 0.0),
            latch.update((event,), 0.5),
            latch.update((event,), 1.0),
            latch.update((), 1.5),
        ]

        assert onsets == [(), (event,), (), ()]
        assert latch.event_count == 1
        assert latch.first_event_sec == 0.5

    def test_reentry_counts_new_event_keeps_first_time(self) -> None:
        latch = BedExitLatch()
        event = BedExitEvent(person_id=7, bed_id=2)

        latch.update((event,), 0.5)
        latch.update((), 1.0)
        latch.update((event,), 1.5)

        assert latch.event_count == 2
        assert latch.first_event_sec == 0.5


def test_app_live_source_is_not_strided() -> None:
    """The live playback source must consume every frame (train/serve parity).

    Asserted on app.py's source text to keep Streamlit out of unit tests: the
    VideoFileSource construction carries no frame_stride argument, and the
    legacy PLAYBACK_FRAME_STRIDE constant is gone.
    """
    from pathlib import Path

    app_src = (Path(__file__).parent.parent / "demo" / "app.py").read_text()
    assert "PLAYBACK_FRAME_STRIDE" not in app_src
    assert "VideoFileSource(selected_source.video.path)" in app_src
    assert "RENDER_FRAME_STRIDE" in app_src
