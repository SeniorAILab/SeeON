"""BedDetector multi-bed low-frequency bed-localization 계약(contract).

Stubs inference so these tests carry no ultralytics dependency and no real
weight. They pin tuple-return semantics, filtering/dedup behavior, deterministic
ordering, multi-frame union, and caller cache/re-detect contracts.
"""

from __future__ import annotations

import numpy as np

from contracts import BoundingBox, Frame
from contracts.runner import bed_result
from worker.perception.bed_detector import BedDetector
from worker.runners import YoloBedSegRunner, dedupe_bed_boxes


def _frame() -> Frame:
    return Frame(index=0, time_sec=0.0, image=np.zeros((4, 4, 3), dtype=np.uint8))


class _StubRunner:
    """Records calls so we can assert one-shot semantics without a real model."""

    def __init__(self, result: tuple[tuple[int, int, int, int, float], ...]) -> None:
        self._result = result
        self.calls = 0

    def detect_beds(self, frame):  # noqa: ANN001 - test stub
        self.calls += 1
        return bed_result(self._result)


class _SequenceRunner:
    def __init__(self, results: tuple[tuple[tuple[int, int, int, int, float], ...], ...]) -> None:
        self._results = results
        self.calls = 0

    def detect_beds(self, frame):  # noqa: ANN001 - test stub
        result = self._results[self.calls]
        self.calls += 1
        return bed_result(result)


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


class _Masks:
    def __init__(self, polygons: tuple[tuple[tuple[int, int], ...], ...]) -> None:
        self.xy = [np.array(poly, dtype=float) for poly in polygons]


class _Result:
    def __init__(self, boxes: _Boxes | None, masks: _Masks | None = None) -> None:
        self.boxes = boxes
        self.masks = masks


class _Model:
    names = {59: "bed", 0: "person"}

    def __init__(self, boxes: _Boxes | None, masks: _Masks | None = None) -> None:
        self._boxes = boxes
        self._masks = masks
        self.calls: list[tuple[object, float, bool, str]] = []

    def predict(self, *, source, conf: float, verbose: bool, device: str):  # noqa: ANN001,ANN201
        self.calls.append((source, conf, verbose, device))
        return [_Result(self._boxes, self._masks)]


def _rect_polygon(box: tuple[int, int, int, int]) -> tuple[tuple[int, int], ...]:
    x1, y1, x2, y2 = box
    return ((x1, y1), (x2, y1), (x2, y2), (x1, y2))


def _seg_runner_with(
    xyxy: tuple[tuple[int, int, int, int], ...],
    conf: tuple[float, ...],
    cls: tuple[int, ...] | None = None,
    polygons: tuple[tuple[tuple[int, int], ...], ...] | None = None,
) -> tuple[YoloBedSegRunner, _Model]:
    runner = YoloBedSegRunner.__new__(YoloBedSegRunner)
    polys = polygons if polygons is not None else tuple(_rect_polygon(b) for b in xyxy)
    masks = _Masks(polys) if xyxy else None
    model = _Model(_Boxes(xyxy, conf, cls or (59,) * len(xyxy)), masks)
    runner._model = model
    runner._confidence = 0.25
    runner._max_points = 48
    runner._bed_class_id = 59
    runner._device = "cpu"
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
    # per frame (the per-frame path stays a single pose pass; see the ADR).
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
            return bed_result(())

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

def test_seg_runner_returns_bed_instances_with_polygons() -> None:
    runner, model = _seg_runner_with(
        ((0, 0, 100, 100), (200, 0, 300, 100)),
        (0.8, 0.7),
        polygons=(
            ((0, 0), (100, 0), (100, 100), (0, 100)),
            ((200, 0), (300, 0), (300, 100), (200, 100)),
        ),
    )
    frame = np.zeros((2, 2, 3), dtype=np.uint8)

    beds = runner.detect_beds(frame)

    assert beds.kind == "bed"
    assert beds.boxes == (
        (0, 0, 100, 100, 0.8, ((0, 0), (100, 0), (100, 100), (0, 100))),
        (200, 0, 300, 100, 0.7, ((200, 0), (300, 0), (300, 100), (200, 100))),
    )
    assert model.calls == [(frame, 0.25, False, "cpu")]


def test_seg_runner_filters_non_bed_class_and_low_confidence() -> None:
    runner, _ = _seg_runner_with(
        ((0, 0, 40, 40), (50, 0, 90, 40), (100, 0, 140, 40)),
        (0.9, 0.2, 0.8),
        (59, 59, 0),
    )

    beds = runner.detect_beds(np.zeros((1, 1, 3), dtype=np.uint8))

    # class-0 dropped; conf 0.2 < 0.25 dropped; only the first bed survives.
    assert tuple(b[:5] for b in beds.boxes) == ((0, 0, 40, 40, 0.9),)


def test_seg_runner_returns_empty_without_masks_or_bed_class() -> None:
    runner, _ = _seg_runner_with((), ())
    assert runner.detect_beds(np.zeros((1, 1, 3), dtype=np.uint8)).boxes == ()

    runner, _ = _seg_runner_with(((0, 0, 10, 10),), (0.9,))
    runner._bed_class_id = None
    assert runner.detect_beds(np.zeros((1, 1, 3), dtype=np.uint8)).boxes == ()


def test_seg_runner_has_no_hard_cap() -> None:
    runner, _ = _seg_runner_with(
        tuple((i * 20, 0, i * 20 + 10, 10) for i in range(5)),
        (0.9, 0.8, 0.7, 0.6, 0.5),
    )

    beds = runner.detect_beds(np.zeros((1, 1, 3), dtype=np.uint8))

    assert len(tuple(beds.boxes)) == 5


def test_detect_attaches_polygon_to_deduped_bed() -> None:
    polygon = ((10, 20), (110, 20), (110, 220), (10, 220))

    class _SegStub:
        def detect_beds(self, frame):  # noqa: ANN001 - test stub
            return bed_result(((10, 20, 110, 220, 0.83, polygon),))

    boxes = BedDetector(runner=_SegStub()).detect(_frame())

    assert boxes == (
        BoundingBox(x1=10, y1=20, x2=110, y2=220, confidence=0.83, polygon=polygon),
    )


def test_detect_returns_all_beds_without_hard_cap() -> None:
    runner = _StubRunner(
        (
            (0, 0, 40, 100, 0.90),
            (100, 0, 140, 100, 0.85),
            (200, 0, 240, 100, 0.80),
            (300, 0, 340, 100, 0.75),
            (400, 0, 440, 100, 0.70),
            (500, 0, 540, 100, 0.65),
        )
    )

    boxes = BedDetector(runner=runner).detect(_frame())

    assert len(boxes) == 6
    assert tuple(box.x1 for box in boxes) == (0, 100, 200, 300, 400, 500)
