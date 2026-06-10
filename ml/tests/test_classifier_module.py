from __future__ import annotations

import numpy as np

from demo.classifier_module import FallClassifierModule
from demo.classifiers import ClassifierParams, RuleBasedClassifier
from demo.seam import (
    FALL_LABEL_TEXT,
    BoundingBox,
    DetectionLabel,
    DetectionResult,
    Frame,
    ModelModule,
)


def _frame(index: int, time_sec: float, h: int = 480, w: int = 640) -> Frame:
    return Frame(index=index, time_sec=time_sec, image=np.zeros((h, w, 3), dtype=np.uint8))


def _kpts_17_blank() -> tuple[tuple[int, int, float], ...]:
    """17 zero-confidence keypoints (no pose data)."""
    return tuple((0, 0, 0.0) for _ in range(17))


class _FakePoseModule:
    """Pose module stub returning a fixed DetectionResult."""

    def __init__(self, box: BoundingBox) -> None:
        self._box = box

    def predict(self, frame: Frame) -> DetectionResult:
        return DetectionResult(
            boxes=(self._box,),
            labels=(DetectionLabel(text="person", confidence=0.9, is_fall=False),),
            keypoints=(_kpts_17_blank(),),
        )


class _EmptyPoseModule:
    def predict(self, frame: Frame) -> DetectionResult:
        return DetectionResult()


def _wide_low_box() -> BoundingBox:
    # w=400, h=40 → aspect=10.0 > 1.2; center_y=420 → vc=420/480=0.875 > 0.55
    return BoundingBox(x1=100, y1=400, x2=500, y2=440, confidence=0.9)


def _tall_high_box() -> BoundingBox:
    # w=40, h=160 → aspect=0.25 < 1.2; center_y=200 → vc=200/480≈0.42 < 0.55
    return BoundingBox(x1=100, y1=120, x2=140, y2=280, confidence=0.9)


class TestFallClassifierModule:
    def test_isinstance_satisfies_model_module_protocol(self) -> None:
        module = FallClassifierModule(
            _FakePoseModule(_wide_low_box()), RuleBasedClassifier(ClassifierParams())
        )
        assert isinstance(module, ModelModule)

    def test_wide_low_box_emits_fall_label_after_sustain(self) -> None:
        params = ClassifierParams(sustained_down_sec=2.0)
        module = FallClassifierModule(_FakePoseModule(_wide_low_box()), RuleBasedClassifier(params))

        r0 = module.predict(_frame(0, 0.0))
        r1 = module.predict(_frame(1, 1.0))
        r2 = module.predict(_frame(2, 2.0))

        assert r0.labels[0].is_fall is False
        assert r1.labels[0].is_fall is False
        assert r2.labels[0].is_fall is True
        assert r2.labels[0].text == FALL_LABEL_TEXT

    def test_tall_high_box_never_emits_fall(self) -> None:
        params = ClassifierParams(sustained_down_sec=2.0)
        module = FallClassifierModule(
            _FakePoseModule(_tall_high_box()), RuleBasedClassifier(params)
        )
        for i in range(10):
            result = module.predict(_frame(i, float(i)))
            assert result.labels[0].is_fall is False

    def test_keypoints_preserved_from_pose_result(self) -> None:
        params = ClassifierParams()
        module = FallClassifierModule(
            _FakePoseModule(_wide_low_box()), RuleBasedClassifier(params)
        )
        result = module.predict(_frame(0, 0.0))
        assert len(result.keypoints) > 0
        assert len(result.keypoints[0]) == 17

    def test_boxes_preserved_unchanged(self) -> None:
        box = _wide_low_box()
        params = ClassifierParams()
        module = FallClassifierModule(_FakePoseModule(box), RuleBasedClassifier(params))
        result = module.predict(_frame(0, 0.0))
        assert result.boxes == (box,)

    def test_no_boxes_returns_pose_result_unchanged(self) -> None:
        params = ClassifierParams()
        module = FallClassifierModule(_EmptyPoseModule(), RuleBasedClassifier(params))
        result = module.predict(_frame(0, 0.0))
        assert result.boxes == ()
        assert result.labels == ()
        assert result.keypoints == ()

    def test_non_primary_persons_keep_person_label(self) -> None:
        """With two boxes the secondary person keeps text='person', is_fall=False."""
        small_box = BoundingBox(x1=0, y1=0, x2=10, y2=10, confidence=0.5)
        large_box = _wide_low_box()

        class _TwoPersonPoseModule:
            def predict(self, frame: Frame) -> DetectionResult:
                return DetectionResult(
                    boxes=(small_box, large_box),
                    labels=(
                        DetectionLabel(text="person", confidence=0.5, is_fall=False),
                        DetectionLabel(text="person", confidence=0.9, is_fall=False),
                    ),
                    keypoints=(_kpts_17_blank(), _kpts_17_blank()),
                )

        params = ClassifierParams(sustained_down_sec=2.0)
        module = FallClassifierModule(_TwoPersonPoseModule(), RuleBasedClassifier(params))

        # Feed enough time for fall to fire
        module.predict(_frame(0, 0.0))
        module.predict(_frame(1, 1.0))
        result = module.predict(_frame(2, 2.0))

        # large_box is primary (index 1); small_box is secondary (index 0)
        primary_label = result.labels[1]
        secondary_label = result.labels[0]

        assert primary_label.is_fall is True
        assert secondary_label.is_fall is False
        assert secondary_label.text == "person"
