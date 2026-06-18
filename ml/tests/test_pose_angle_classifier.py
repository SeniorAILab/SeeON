"""Tests for the torso-angle feature and the pose-driven fall classifier.

These cover the half of issue #218 that makes the pose *matter*: the rule-based
classifier judges falls from the box alone, so the hybrid backend only changes
the verdict once a classifier consumes the shoulder/hip angle.
"""
from __future__ import annotations

from demo.classifiers import (
    CLASSIFIER_REGISTRY,
    Classifier,
    ClassifierParams,
    PoseAngleClassifier,
    available_classifier_keys,
    build_classifier,
)
from demo.features import FrameFeatures, extract_frame_features
from demo.seam import BoundingBox, DetectionLabel, DetectionResult

_FRAME_H = 480
_FRAME_W = 640


def _kpts(
    shoulder: tuple[int, int], hip: tuple[int, int], conf: float = 0.9
) -> tuple[tuple[int, int, float], ...]:
    points = [(0, 0, 0.0) for _ in range(17)]
    points[5] = (shoulder[0], shoulder[1], conf)  # left shoulder
    points[6] = (shoulder[0], shoulder[1], conf)  # right shoulder
    points[11] = (hip[0], hip[1], conf)  # left hip
    points[12] = (hip[0], hip[1], conf)  # right hip
    return tuple(points)


def _result(kpts: tuple[tuple[int, int, float], ...]) -> DetectionResult:
    return DetectionResult(
        boxes=(BoundingBox(0, 0, _FRAME_W, _FRAME_H, 0.9),),
        labels=(DetectionLabel(text="person", confidence=0.9, is_fall=False),),
        keypoints=(kpts,),
    )


# ---------------------------------------------------------------------------
# torso_angle_deg feature
# ---------------------------------------------------------------------------


def _features_for(shoulder: tuple[int, int], hip: tuple[int, int]) -> FrameFeatures:
    return extract_frame_features(_result(_kpts(shoulder, hip)), _FRAME_H, _FRAME_W)


class TestTorsoAngleFeature:
    def test_vertical_torso_is_near_ninety_degrees(self) -> None:
        # Shoulders directly above hips → upright.
        assert _features_for((200, 100), (200, 300)).torso_angle_deg > 80.0

    def test_horizontal_torso_is_near_zero_degrees(self) -> None:
        # Shoulders and hips at the same height, offset in x → lying flat.
        assert _features_for((100, 200), (300, 200)).torso_angle_deg < 10.0

    def test_diagonal_torso_is_near_forty_five_degrees(self) -> None:
        angle = _features_for((100, 100), (200, 200)).torso_angle_deg
        assert 40.0 < angle < 50.0

    def test_missing_pose_defaults_to_upright(self) -> None:
        blank = tuple((0, 0, 0.0) for _ in range(17))
        features = extract_frame_features(_result(blank), _FRAME_H, _FRAME_W)
        assert features.torso_angle_deg == 90.0

    def test_no_person_defaults_to_upright(self) -> None:
        features = extract_frame_features(DetectionResult(), _FRAME_H, _FRAME_W)
        assert features.has_person is False
        assert features.torso_angle_deg == 90.0


# ---------------------------------------------------------------------------
# PoseAngleClassifier
# ---------------------------------------------------------------------------


def _lying() -> FrameFeatures:
    return FrameFeatures(
        has_person=True,
        aspect_ratio=2.0,
        vertical_center=0.8,
        box_height_ratio=0.3,
        torso_vertical=0.02,
        torso_angle_deg=5.0,
    )


def _standing() -> FrameFeatures:
    return FrameFeatures(
        has_person=True,
        aspect_ratio=0.4,
        vertical_center=0.45,
        box_height_ratio=0.6,
        torso_vertical=0.4,
        torso_angle_deg=85.0,
    )


class TestPoseAngleClassifier:
    def test_satisfies_classifier_protocol(self) -> None:
        assert isinstance(PoseAngleClassifier(ClassifierParams()), Classifier)

    def test_fires_fall_after_sustained_lying(self) -> None:
        clf = PoseAngleClassifier(ClassifierParams(sustained_down_sec=2.0))
        assert clf.update(_lying(), 0.0).is_fall is False
        assert clf.update(_lying(), 1.0).is_fall is False
        result = clf.update(_lying(), 2.0)
        assert result.is_fall is True
        assert result.label == "fall"

    def test_standing_never_fires(self) -> None:
        clf = PoseAngleClassifier(ClassifierParams(sustained_down_sec=2.0))
        for i in range(10):
            assert clf.update(_standing(), float(i)).is_fall is False

    def test_standing_frame_resets_the_timer(self) -> None:
        clf = PoseAngleClassifier(ClassifierParams(sustained_down_sec=2.0))
        clf.update(_lying(), 0.0)
        clf.update(_lying(), 1.5)
        assert clf.update(_standing(), 1.6).is_fall is False
        # Timer reset → a single later lying frame must not immediately fire.
        assert clf.update(_lying(), 2.0).is_fall is False

    def test_lying_high_in_frame_is_not_a_fall(self) -> None:
        # Flat torso but high vertical_center (e.g. lying in a bed) → not on floor.
        bed = FrameFeatures(
            has_person=True,
            aspect_ratio=2.0,
            vertical_center=0.30,
            box_height_ratio=0.3,
            torso_vertical=0.02,
            torso_angle_deg=5.0,
        )
        clf = PoseAngleClassifier(ClassifierParams(sustained_down_sec=1.0))
        for i in range(5):
            assert clf.update(bed, float(i)).is_fall is False

    def test_angle_threshold_is_configurable(self) -> None:
        # A 60° torso is "lying" only when angle_max_deg is raised above it.
        leaning = FrameFeatures(
            has_person=True,
            aspect_ratio=1.0,
            vertical_center=0.8,
            box_height_ratio=0.5,
            torso_vertical=0.2,
            torso_angle_deg=60.0,
        )
        strict = PoseAngleClassifier(ClassifierParams(sustained_down_sec=1.0, angle_max_deg=45.0))
        lenient = PoseAngleClassifier(ClassifierParams(sustained_down_sec=1.0, angle_max_deg=70.0))
        strict.update(leaning, 0.0)
        assert strict.update(leaning, 1.0).is_fall is False
        lenient.update(leaning, 0.0)
        assert lenient.update(leaning, 1.0).is_fall is True


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------


class TestRegistry:
    def test_pose_angle_is_registered_and_available(self) -> None:
        assert "pose_angle" in available_classifier_keys()
        keys = {spec.key for spec in CLASSIFIER_REGISTRY}
        assert {"rule_based", "pose_angle"} <= keys

    def test_build_classifier_returns_pose_angle_instance(self) -> None:
        clf = build_classifier("pose_angle", ClassifierParams())
        assert isinstance(clf, PoseAngleClassifier)
        assert clf.name == "pose_angle"
