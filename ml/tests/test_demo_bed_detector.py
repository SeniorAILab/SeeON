"""BedDetector multi-bed low-frequency bed-localization 계약(contract).

Stubs inference so these tests carry no ultralytics dependency and no real
weight. They pin tuple-return semantics, filtering/dedup behavior, deterministic
ordering, multi-frame union, and caller cache/re-detect contracts.
"""

from __future__ import annotations

import numpy as np

from core.bed_detector import BedDetector
from core.contract import BoundingBox, Frame
from core.yolo_runtime import YoloBedRunner, dedupe_bed_boxes


def _frame() -> Frame:
    return Frame(index=0, time_sec=0.0, image=np.zeros((4, 4, 3), dtype=np.uint8))


class _StubRunner:
    """Records calls so we can assert one-shot semantics without a real model."""

    def __init__(self, result: tuple[tuple[int, int, int, int, float], ...]) -> None:
        self._result = result
        self.calls = 0

    def detect_beds(self, frame):  # noqa: ANN001 - test stub
        self.calls += 1
        return self._result


class _SequenceRunner:
    def __init__(self, results: tuple[tuple[tuple[int, int, int, int, float], ...], ...]) -> None:
        self._results = results
        self.calls = 0

    def detect_beds(self, frame):  # noqa: ANN001 - test stub
        result = self._results[self.calls]
        self.calls += 1
        return result


class _Array:
    def __init__(self, values: object) -> None:
        self._values = np.array(values)

    def cpu(self):  # noqa: ANN201 - mirrors torch tensor API in tests
        return self

    def numpy(self):  # noqa: ANN201 - mirrors torch tensor API in tests
        return self._values


class _Boxes:
    def __init__(
        self,
        xyxy: tuple[tuple[int, int, int, int], ...],
        conf: tuple[float, ...],
        cls: tuple[int, ...],
    ) -> None:
        self.xyxy = _Array(xyxy)
        self.conf = _Array(conf)
        self.cls = _Array(cls)

    def __len__(self) -> int:
        return len(self.conf._values)


class _Result:
    def __init__(self, boxes: _Boxes | None) -> None:
        self.boxes = boxes


class _Model:
    names = {59: "bed", 0: "person"}

    def __init__(self, boxes: _Boxes | None) -> None:
        self._boxes = boxes
        self.calls: list[tuple[object, float, bool]] = []

    def predict(self, *, source, conf: float, verbose: bool):  # noqa: ANN001,ANN201
        self.calls.append((source, conf, verbose))
        return [_Result(self._boxes)]


def _runner_with_boxes(
    xyxy: tuple[tuple[int, int, int, int], ...],
    conf: tuple[float, ...],
    cls: tuple[int, ...] | None = None,
    *,
    max_beds: int = 4,
) -> tuple[YoloBedRunner, _Model]:
    runner = YoloBedRunner.__new__(YoloBedRunner)
    model = _Model(_Boxes(xyxy, conf, cls or (59,) * len(xyxy)))
    runner._model = model
    runner._confidence = 0.25
    runner._max_beds = max_beds
    runner._bed_class_id = 59
    return runner, model


def test_detect_translates_multiple_runner_boxes_into_bounding_boxes() -> None:
    runner = _StubRunner(((10, 20, 110, 220, 0.83), (200, 30, 320, 240, 0.71)))
    detector = BedDetector(runner=runner)

    boxes = detector.detect(_frame())

    assert boxes == (
        BoundingBox(x1=10, y1=20, x2=110, y2=220, confidence=0.83),
        BoundingBox(x1=200, y1=30, x2=320, y2=240, confidence=0.71),
    )


def test_detect_invokes_runner_exactly_once() -> None:
    runner = _StubRunner(((0, 0, 1, 1, 0.5),))
    detector = BedDetector(runner=runner)

    detector.detect(_frame())

    # One seed-frame inference; the page caches the ROIs and never re-detects
    # per frame (the per-frame path stays a single pose pass, ADR-005 §3).
    assert runner.calls == 1


def test_detect_returns_empty_tuple_when_runner_finds_no_bed() -> None:
    runner = _StubRunner(())
    detector = BedDetector(runner=runner)

    assert detector.detect(_frame()) == ()


def test_detect_passes_frame_image_to_runner() -> None:
    captured: list[object] = []

    class _CapturingRunner:
        def detect_beds(self, frame):  # noqa: ANN001 - test stub
            captured.append(frame)
            return ()

    frame = _frame()
    BedDetector(runner=_CapturingRunner()).detect(frame)

    assert len(captured) == 1
    assert captured[0] is frame.image


def test_detect_preserves_runner_confidence_and_coords() -> None:
    raw = ((0, 0, 100, 100, 1.0), (5, 5, 6, 6, 0.25))

    boxes = BedDetector(runner=_StubRunner(raw)).detect(_frame())

    assert tuple((box.x1, box.y1, box.x2, box.y2, box.confidence) for box in boxes) == raw


def test_detect_union_dedupes_across_multiple_frames() -> None:
    runner = _SequenceRunner(
        (
            ((0, 0, 100, 100, 0.8),),
            ((53, 0, 153, 100, 0.7),),
            ((200, 0, 300, 100, 0.9),),
        )
    )
    detector = BedDetector(runner=runner)

    boxes = detector.detect_union((_frame(), _frame(), _frame()))

    assert boxes == (
        BoundingBox(x1=0, y1=0, x2=100, y2=100, confidence=0.8),
        BoundingBox(x1=53, y1=0, x2=153, y2=100, confidence=0.7),
        BoundingBox(x1=200, y1=0, x2=300, y2=100, confidence=0.9),
    )
    assert runner.calls == 3


def test_dedupe_merges_only_high_overlap_beds_at_merge_threshold() -> None:
    duplicate_boxes = (
        (0, 0, 100, 100, 0.8),
        (4, 4, 104, 104, 0.9),
    )
    adjacent_boxes = (
        (0, 0, 100, 100, 0.8),
        (53, 0, 153, 100, 0.7),
    )

    assert dedupe_bed_boxes(duplicate_boxes, max_beds=4) == (
        (4, 4, 104, 104, 0.9),
    )
    assert dedupe_bed_boxes(adjacent_boxes, max_beds=4) == adjacent_boxes

def test_yolo_detect_beds_filters_threshold_class_and_caps_deterministically() -> None:
    runner, model = _runner_with_boxes(
        (
            (300, 0, 340, 40),
            (0, 0, 40, 40),
            (100, 0, 140, 40),
            (200, 0, 240, 40),
            (400, 0, 440, 40),
            (500, 0, 540, 40),
            (600, 0, 640, 40),
        ),
        (0.9, 0.3, 0.6, 0.7, 0.24, 0.8, 0.95),
        (59, 59, 59, 59, 59, 0, 59),
        max_beds=4,
    )
    frame = np.zeros((2, 2, 3), dtype=np.uint8)

    boxes = runner.detect_beds(frame)

    assert boxes == (
        (0, 0, 40, 40, 0.3),
        (100, 0, 140, 40, 0.6),
        (200, 0, 240, 40, 0.7),
        (300, 0, 340, 40, 0.9),
    )
    assert model.calls == [(frame, 0.25, False)]


def test_yolo_detect_beds_returns_empty_tuple_for_no_boxes_or_no_bed_class() -> None:
    runner, _ = _runner_with_boxes((), ())
    assert runner.detect_beds(np.zeros((1, 1, 3), dtype=np.uint8)) == ()

    runner, _ = _runner_with_boxes(((0, 0, 10, 10),), (0.9,), (0,))
    assert runner.detect_beds(np.zeros((1, 1, 3), dtype=np.uint8)) == ()

    runner, _ = _runner_with_boxes(((0, 0, 10, 10),), (0.9,))
    runner._bed_class_id = None
    assert runner.detect_beds(np.zeros((1, 1, 3), dtype=np.uint8)) == ()


def test_yolo_detect_beds_suppresses_duplicate_nms() -> None:
    runner, _ = _runner_with_boxes(
        ((0, 0, 100, 100), (5, 5, 105, 105), (200, 0, 300, 100)),
        (0.8, 0.9, 0.7),
    )

    assert runner.detect_beds(np.zeros((1, 1, 3), dtype=np.uint8)) == (
        (5, 5, 105, 105, 0.9),
        (200, 0, 300, 100, 0.7),
    )


def test_yolo_detect_beds_retains_adjacent_beds_after_merge_tuning() -> None:
    runner, _ = _runner_with_boxes(
        ((0, 0, 100, 100), (53, 0, 153, 100), (260, 0, 360, 100)),
        (0.8, 0.7, 0.6),
    )

    assert runner.detect_beds(np.zeros((1, 1, 3), dtype=np.uint8)) == (
        (0, 0, 100, 100, 0.8),
        (53, 0, 153, 100, 0.7),
        (260, 0, 360, 100, 0.6),
    )


def test_yolo_detect_beds_honors_max_beds_cap() -> None:
    runner, _ = _runner_with_boxes(
        (
            (0, 0, 10, 10),
            (20, 0, 30, 10),
            (40, 0, 50, 10),
            (60, 0, 70, 10),
            (80, 0, 90, 10),
        ),
        (0.9, 0.8, 0.7, 0.6, 0.5),
        max_beds=4,
    )

    boxes = runner.detect_beds(np.zeros((1, 1, 3), dtype=np.uint8))

    assert len(boxes) == 4
    assert boxes == (
        (0, 0, 10, 10, 0.9),
        (20, 0, 30, 10, 0.8),
        (40, 0, 50, 10, 0.7),
        (60, 0, 70, 10, 0.6),
    )
