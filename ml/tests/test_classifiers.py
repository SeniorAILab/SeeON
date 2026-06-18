from __future__ import annotations

import pytest

from demo.classifiers import (
    ClassifierParams,
    RuleBasedClassifier,
    available_classifier_keys,
    build_classifier,
)
from demo.features import FrameFeatures


def _down(params: ClassifierParams) -> FrameFeatures:
    """FrameFeatures that satisfy the 'down' condition for the given params."""
    return FrameFeatures(
        has_person=True,
        aspect_ratio=params.aspect_ratio_min + 0.3,
        vertical_center=params.vertical_center_min + 0.2,
        box_height_ratio=0.08,
        torso_vertical=0.01,
    )


def _standing(params: ClassifierParams) -> FrameFeatures:
    """FrameFeatures that do NOT satisfy the 'down' condition."""
    return FrameFeatures(
        has_person=True,
        aspect_ratio=params.aspect_ratio_min - 0.5,
        vertical_center=params.vertical_center_min - 0.2,
        box_height_ratio=0.3,
        torso_vertical=0.25,
    )


class TestRuleBasedClassifier:
    def test_no_fall_before_sustain_window_elapsed(self) -> None:
        params = ClassifierParams(sustained_down_sec=2.0)
        clf = RuleBasedClassifier(params)
        down = _down(params)

        assert clf.update(down, 0.0).is_fall is False
        assert clf.update(down, 1.5).is_fall is False

    def test_fall_fires_at_sustain_boundary(self) -> None:
        params = ClassifierParams(sustained_down_sec=2.0)
        clf = RuleBasedClassifier(params)
        down = _down(params)

        clf.update(down, 0.0)
        clf.update(down, 1.0)
        result = clf.update(down, 2.0)

        assert result.is_fall is True
        assert result.label == "fall"
        assert result.confidence == 1.0

    def test_standing_sequence_never_fires_fall(self) -> None:
        params = ClassifierParams(sustained_down_sec=2.0)
        clf = RuleBasedClassifier(params)
        standing = _standing(params)

        for t in (0.0, 1.0, 2.0, 3.0, 5.0):
            assert clf.update(standing, t).is_fall is False

    def test_interrupted_down_resets_timer(self) -> None:
        params = ClassifierParams(sustained_down_sec=2.0)
        clf = RuleBasedClassifier(params)
        down = _down(params)
        standing = _standing(params)

        # 1.5 s of down — not enough
        clf.update(down, 0.0)
        clf.update(down, 1.5)
        # interruption resets the start marker
        clf.update(standing, 1.6)
        # timer restarts at t=1.7
        clf.update(down, 1.7)
        # only 1.8 s since restart at t=3.5 — still below threshold
        assert clf.update(down, 3.5).is_fall is False
        # 2.1 s since restart → fires
        assert clf.update(down, 3.8).is_fall is True

    def test_reset_clears_internal_state(self) -> None:
        params = ClassifierParams(sustained_down_sec=2.0)
        clf = RuleBasedClassifier(params)
        down = _down(params)

        clf.update(down, 0.0)
        clf.update(down, 2.5)  # fall has fired
        clf.reset()

        # After reset the classifier starts fresh
        assert clf.update(down, 0.0).is_fall is False

    def test_confidence_ramps_from_zero_to_one(self) -> None:
        params = ClassifierParams(sustained_down_sec=2.0)
        clf = RuleBasedClassifier(params)
        down = _down(params)

        r0 = clf.update(down, 0.0)
        r1 = clf.update(down, 1.0)

        assert 0.0 <= r0.confidence < 1.0
        assert r0.confidence < r1.confidence

    def test_no_person_frame_gives_no_fall(self) -> None:
        params = ClassifierParams()
        clf = RuleBasedClassifier(params)
        no_person = FrameFeatures(
            has_person=False,
            aspect_ratio=0.0,
            vertical_center=0.0,
            box_height_ratio=0.0,
            torso_vertical=0.0,
        )
        result = clf.update(no_person, 0.0)
        assert result.is_fall is False
        assert result.label == "no-fall"

    def test_name_attribute(self) -> None:
        clf = RuleBasedClassifier(ClassifierParams())
        assert clf.name == "rule_based"


class TestRegistry:
    def test_build_classifier_rule_based_returns_working_classifier(self) -> None:
        params = ClassifierParams()
        clf = build_classifier("rule_based", params)
        assert clf.name == "rule_based"

    def test_build_classifier_unknown_key_raises_value_error(self) -> None:
        with pytest.raises(ValueError, match="Unknown classifier key"):
            build_classifier("nonexistent", ClassifierParams())

    def test_build_classifier_lstm_routes_to_temporal_builder(self) -> None:
        with pytest.raises(ValueError, match="temporal ModelModule"):
            build_classifier("lstm", ClassifierParams())

    def test_build_classifier_random_forest_routes_to_temporal_builder(self) -> None:
        with pytest.raises(ValueError, match="temporal ModelModule"):
            build_classifier("random_forest", ClassifierParams())

    def test_available_keys_contract(self) -> None:
        """rule_based + pose_angle are always available; the rest are temporal.

        ``rule_based`` (box-only) and ``pose_angle`` (pose-driven, issue #218) are
        the two always-on rule classifiers. Availability for temporal models is
        artifact-driven (computed at import from disk), so the exact tuple depends
        on whether training has run. This asserts the invariant contract instead
        of a fixed membership, which keeps the test stable both before and after
        artifacts exist on disk.
        """
        from demo.temporal_module import TEMPORAL_MODEL_KEYS

        always_on = {"rule_based", "pose_angle"}
        keys = available_classifier_keys()
        assert always_on <= set(keys)
        extra = set(keys) - always_on
        assert extra <= set(TEMPORAL_MODEL_KEYS), (
            f"Unexpected available keys outside temporal set: {extra}"
        )
