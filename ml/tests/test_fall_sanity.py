"""Synthetic fall-trajectory sanity tests for RuleBasedClassifier.

SYNTHETIC DATA ONLY — no real video clips or CCTV footage used here.
Gold-8 validation (real-clip labelling against actual 요양원 탑다운 CCTV footage)
is pending; data is absent from the worktree at time of writing.

These tests verify the classifier's temporal logic at a realistic frame rate
(12 fps) across two scenarios:
  - Fall trajectory: standing → sustained lying pose → classifier must fire.
  - Normal trajectory: standing throughout + a single brief crouch → must NOT fire.
"""

from __future__ import annotations

from demo.classifiers import ClassifierParams, RuleBasedClassifier
from perception.frame_features import FrameFeatures

_FPS = 12.0
_DT = 1.0 / _FPS


def _standing(params: ClassifierParams) -> FrameFeatures:
    return FrameFeatures(
        has_person=True,
        aspect_ratio=params.aspect_ratio_min - 0.5,
        vertical_center=params.vertical_center_min - 0.2,
        box_height_ratio=0.3,
        torso_vertical=0.25,
    )


def _lying(params: ClassifierParams) -> FrameFeatures:
    return FrameFeatures(
        has_person=True,
        aspect_ratio=params.aspect_ratio_min + 0.3,
        vertical_center=params.vertical_center_min + 0.2,
        box_height_ratio=0.08,
        torso_vertical=0.01,
    )


class TestFallTrajectory:
    def test_standing_then_lying_fires_fall_after_sustain(self) -> None:
        """~10 standing frames then sustained lying frames → fall fires after threshold."""
        params = ClassifierParams(sustained_down_sec=2.0)
        clf = RuleBasedClassifier(params)
        standing = _standing(params)
        lying = _lying(params)

        # 10 standing frames; none should fire
        for i in range(10):
            result = clf.update(standing, i * _DT)
            assert result.is_fall is False, f"Unexpected fall during standing at frame {i}"

        # Transition to lying
        transition_start = 10 * _DT
        fall_fired = False
        for i in range(int(_FPS * 6)):  # up to 6 s of lying frames
            t = transition_start + i * _DT
            result = clf.update(lying, t)
            if result.is_fall:
                elapsed_since_transition = t - transition_start
                assert elapsed_since_transition >= params.sustained_down_sec, (
                    f"Fall fired too early: {elapsed_since_transition:.3f}s "
                    f"< sustained_down_sec={params.sustained_down_sec}"
                )
                fall_fired = True
                break

        assert fall_fired, "Expected fall to fire during lying trajectory but it never did"

    def test_normal_trajectory_with_brief_crouch_never_fires(self) -> None:
        """Standing throughout (+ one-frame crouch) must never trigger a fall."""
        params = ClassifierParams(sustained_down_sec=2.0)
        clf = RuleBasedClassifier(params)
        standing = _standing(params)
        lying = _lying(params)

        crouch_frame = 60  # inject a single lying frame mid-sequence
        for i in range(120):  # 10 s at 12 fps
            t = i * _DT
            features = lying if i == crouch_frame else standing
            result = clf.update(features, t)
            assert result.is_fall is False, f"Fall fired unexpectedly at frame {i} (t={t:.3f}s)"
