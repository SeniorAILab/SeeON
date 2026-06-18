"""Unit tests for the YOLO+MediaPipe hybrid pose backend (issue #218).

The pure remap and the module composition are exercised with fakes so this
suite never imports ``mediapipe`` or ``ultralytics`` — matching the lazy-import
seam the production code is built around.
"""
from __future__ import annotations

import numpy as np

from demo.classifier_module import FallClassifierModule
from demo.classifiers import ClassifierParams, PoseAngleClassifier
from demo.mediapipe_pose import (
    MEDIAPIPE_TO_COCO17,
    blank_coco17_keypoints,
    remap_landmarks_to_coco17,
)
from demo.model_modules import MediaPipePoseModule
from demo.seam import FALL_LABEL_TEXT, DetectionResult, Frame
from demo.yolo_runtime import _resolve_person_class_id


def _frame(h: int = 480, w: int = 640) -> Frame:
    return Frame(index=0, time_sec=0.0, image=np.zeros((h, w, 3), dtype=np.uint8))


def _landmarks_33(x: float = 0.5, y: float = 0.5, vis: float = 1.0):
    return [(x, y, vis) for _ in range(33)]


# ---------------------------------------------------------------------------
# remap_landmarks_to_coco17
# ---------------------------------------------------------------------------


class TestRemapLandmarks:
    def test_each_coco_slot_pulls_its_mapped_mediapipe_index(self) -> None:
        # Distinct per-landmark values so we can prove the index wiring.
        lms = [(i / 100.0, i / 100.0, i / 100.0) for i in range(33)]
        coco = remap_landmarks_to_coco17(lms, x1=0, y1=0, roi_w=100, roi_h=100)
        assert len(coco) == 17
        for coco_idx, mp_idx in enumerate(MEDIAPIPE_TO_COCO17):
            px, py, conf = coco[coco_idx]
            assert px == mp_idx  # x = 0 + (mp_idx/100)*100
            assert py == mp_idx
            assert abs(conf - mp_idx / 100.0) < 1e-9

    def test_shoulder_and_hip_slots_match_mediapipe_anatomy(self) -> None:
        # COCO 5/6 = shoulders ← mp 11/12 ; COCO 11/12 = hips ← mp 23/24.
        assert MEDIAPIPE_TO_COCO17[5] == 11
        assert MEDIAPIPE_TO_COCO17[6] == 12
        assert MEDIAPIPE_TO_COCO17[11] == 23
        assert MEDIAPIPE_TO_COCO17[12] == 24

    def test_normalized_points_translate_into_full_frame_pixels(self) -> None:
        coco = remap_landmarks_to_coco17(
            _landmarks_33(0.5, 0.5, 1.0), x1=100, y1=200, roi_w=40, roi_h=80
        )
        for px, py, conf in coco:
            assert px == 120  # 100 + 0.5*40
            assert py == 240  # 200 + 0.5*80
            assert conf == 1.0

    def test_short_landmark_list_degrades_to_blank(self) -> None:
        coco = remap_landmarks_to_coco17(
            [(0.5, 0.5, 1.0)] * 10, x1=0, y1=0, roi_w=10, roi_h=10
        )
        assert coco == blank_coco17_keypoints()

    def test_blank_is_seventeen_zero_confidence_points(self) -> None:
        blank = blank_coco17_keypoints()
        assert len(blank) == 17
        assert all(point == (0, 0, 0.0) for point in blank)


# ---------------------------------------------------------------------------
# MediaPipePoseModule (fakes injected — no native deps)
# ---------------------------------------------------------------------------


class _FakePersonRunner:
    def __init__(self, boxes) -> None:
        self._boxes = boxes

    def detect_persons(self, frame):
        return self._boxes


class _FakeEstimator:
    def __init__(self, landmarks) -> None:
        self._landmarks = landmarks
        self.calls = 0

    def infer(self, roi_rgb):
        self.calls += 1
        return self._landmarks


def _module(boxes, landmarks) -> MediaPipePoseModule:
    return MediaPipePoseModule(
        runner=_FakePersonRunner(boxes), estimator=_FakeEstimator(landmarks)
    )


class TestMediaPipePoseModule:
    def test_emits_box_label_and_remapped_keypoints_per_person(self) -> None:
        boxes = ((10, 20, 110, 220, 0.9), (200, 100, 240, 180, 0.8))
        module = _module(boxes, _landmarks_33(0.5, 0.5, 1.0))
        result = module.predict(_frame())

        assert len(result.boxes) == 2
        assert len(result.labels) == 2
        assert len(result.keypoints) == 2
        assert all(label.text == "person" for label in result.labels)
        assert all(len(kpts) == 17 for kpts in result.keypoints)
        # First box center maps to (10+0.5*100, 20+0.5*200) = (60, 120).
        assert result.keypoints[0][0] == (60, 120, 1.0)

    def test_no_persons_returns_empty_result(self) -> None:
        module = _module((), _landmarks_33())
        result = module.predict(_frame())
        assert result == DetectionResult()

    def test_no_pose_landmarks_yields_blank_keypoints_but_keeps_box(self) -> None:
        module = _module(((10, 20, 110, 220, 0.9),), None)
        result = module.predict(_frame())
        assert len(result.boxes) == 1
        assert result.keypoints[0] == blank_coco17_keypoints()

    def test_box_is_clamped_to_frame_bounds(self) -> None:
        # Box spills past the top-left origin; ROI clamps to (0,0)-(50,50).
        module = _module(((-10, -10, 50, 50, 0.9),), _landmarks_33(0.5, 0.5, 1.0))
        result = module.predict(_frame())
        # center → (0+0.5*50, 0+0.5*50) = (25, 25)
        assert result.keypoints[0][0] == (25, 25, 1.0)

    def test_degenerate_box_yields_blank_keypoints(self) -> None:
        # x2 == x1 → zero-width ROI → blank, never an exception.
        module = _module(((100, 100, 100, 200, 0.9),), _landmarks_33())
        result = module.predict(_frame())
        assert result.keypoints[0] == blank_coco17_keypoints()


# ---------------------------------------------------------------------------
# _resolve_person_class_id
# ---------------------------------------------------------------------------


class TestResolvePersonClassId:
    def test_prefers_coco_index_zero(self) -> None:
        assert _resolve_person_class_id({0: "person", 59: "bed"}) == 0

    def test_falls_back_to_name_search_when_index_zero_is_not_person(self) -> None:
        assert _resolve_person_class_id({3: "person", 0: "background"}) == 3

    def test_none_when_no_person_class(self) -> None:
        assert _resolve_person_class_id({59: "bed"}) is None

    def test_none_for_non_mapping(self) -> None:
        assert _resolve_person_class_id(None) is None


# ---------------------------------------------------------------------------
# End-to-end: YOLO box → MediaPipe pose → pose-angle fall classifier
# ---------------------------------------------------------------------------


def _lying_landmarks():
    """33 landmarks whose shoulders/hips are horizontal (torso flat = lying)."""
    lms = [(0.5, 0.5, 0.0) for _ in range(33)]
    lms[11] = (0.3, 0.5, 0.9)  # left shoulder
    lms[12] = (0.3, 0.5, 0.9)  # right shoulder
    lms[23] = (0.7, 0.5, 0.9)  # left hip
    lms[24] = (0.7, 0.5, 0.9)  # right hip
    return lms


def test_hybrid_pipeline_fires_fall_on_sustained_lying_pose() -> None:
    # Person low in the frame (vertical_center ≈ 0.79) with a flat torso.
    boxes = ((100, 300, 300, 460, 0.9),)
    pose_module = _module(boxes, _lying_landmarks())
    module = FallClassifierModule(
        pose_module=pose_module,
        classifier=PoseAngleClassifier(ClassifierParams(sustained_down_sec=2.0)),
    )

    r0 = module.predict(Frame(index=0, time_sec=0.0, image=np.zeros((480, 640, 3), np.uint8)))
    r1 = module.predict(Frame(index=1, time_sec=1.0, image=np.zeros((480, 640, 3), np.uint8)))
    r2 = module.predict(Frame(index=2, time_sec=2.0, image=np.zeros((480, 640, 3), np.uint8)))

    assert r0.labels[0].is_fall is False
    assert r1.labels[0].is_fall is False
    assert r2.labels[0].is_fall is True
    assert r2.labels[0].text == FALL_LABEL_TEXT
