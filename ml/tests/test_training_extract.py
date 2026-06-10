"""Tests for training.extract_poses.normalize_person_keypoints.

Exercises the pure (YOLO-free) normalisation helper with synthetic fixtures only.
No real Le2i data or YOLO weights are loaded.
"""

from __future__ import annotations

import numpy as np

from training.extract_poses import normalize_person_keypoints

_N_KPT = 17
_CONF_THRESH = 0.2  # mirrors training.config.CONF_THRESHOLD
_W = 640
_H = 480


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_kpts(
    x: int = 100,
    y: int = 200,
    conf: float = 0.9,
) -> tuple[tuple[int, int, float], ...]:
    """Return 17 identical (x, y, conf) tuples — the minimal YOLO pose format."""
    return tuple((x, y, conf) for _ in range(_N_KPT))


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestNormalizePersonKeypoints:
    def test_empty_detections_returns_all_zeros(self) -> None:
        """An empty tuple (no person detected) must produce a float32 zero array."""
        result = normalize_person_keypoints((), frame_w=_W, frame_h=_H, conf_threshold=_CONF_THRESH)
        assert result.shape == (_N_KPT, 3)
        assert result.dtype == np.float32
        np.testing.assert_array_equal(result, np.zeros((_N_KPT, 3), dtype=np.float32))

    def test_high_conf_keypoints_normalized_to_unit_range(self) -> None:
        """High-confidence keypoints must be normalized: x/w ∈ [0,1], y/h ∈ [0,1]."""
        pose_detections = (_make_kpts(x=100, y=200, conf=0.9),)
        result = normalize_person_keypoints(
            pose_detections, frame_w=_W, frame_h=_H, conf_threshold=_CONF_THRESH
        )
        assert result.shape == (_N_KPT, 3)
        assert result.dtype == np.float32
        np.testing.assert_allclose(result[:, 0], 100 / _W, rtol=1e-5)
        np.testing.assert_allclose(result[:, 1], 200 / _H, rtol=1e-5)
        np.testing.assert_allclose(result[:, 2], 0.9, rtol=1e-5)

    def test_low_conf_keypoints_zeroed_entirely(self) -> None:
        """Keypoints below conf_threshold must have x=y=conf=0 (not just conf=0)."""
        kpts: list[tuple[int, int, float]] = []
        for i in range(_N_KPT):
            # keypoints 0–7: high conf; keypoints 8–16: low conf (0.1 < threshold 0.2)
            conf = 0.9 if i < 8 else 0.1
            kpts.append((100, 200, conf))
        pose_detections = (tuple(kpts),)
        result = normalize_person_keypoints(
            pose_detections, frame_w=_W, frame_h=_H, conf_threshold=_CONF_THRESH
        )
        assert result.shape == (_N_KPT, 3)
        assert result.dtype == np.float32
        # High-conf keypoints are normalized correctly
        np.testing.assert_allclose(result[:8, 0], 100 / _W, rtol=1e-5)
        np.testing.assert_allclose(result[:8, 1], 200 / _H, rtol=1e-5)
        np.testing.assert_allclose(result[:8, 2], 0.9, rtol=1e-5)
        # Low-conf keypoints must be fully zeroed (x, y, AND conf = 0)
        np.testing.assert_array_equal(result[8:], 0.0)

    def test_dtype_is_float32_for_all_inputs(self) -> None:
        """Output dtype must always be float32 regardless of input."""
        r1 = normalize_person_keypoints((), 1920, 1080, 0.2)
        assert r1.dtype == np.float32

        kpts = tuple((10, 20, 0.5) for _ in range(_N_KPT))
        r2 = normalize_person_keypoints((kpts,), 1920, 1080, 0.2)
        assert r2.dtype == np.float32

    def test_shape_is_always_n_kpt_by_3(self) -> None:
        """Output shape must always be (17, 3)."""
        r1 = normalize_person_keypoints((), _W, _H, _CONF_THRESH)
        assert r1.shape == (_N_KPT, 3)

        kpts = _make_kpts(conf=0.9)
        r2 = normalize_person_keypoints((kpts,), _W, _H, _CONF_THRESH)
        assert r2.shape == (_N_KPT, 3)

    def test_conf_exactly_at_threshold_is_normalized_not_zeroed(self) -> None:
        """conf == conf_threshold passes the strict-less-than gate and is normalized.

        normalize_person_keypoints zeros only when ``conf < conf_threshold``; a keypoint
        whose confidence equals the threshold exactly is kept and normalized.
        """
        kpts = _make_kpts(x=320, y=240, conf=_CONF_THRESH)
        result = normalize_person_keypoints((kpts,), _W, _H, _CONF_THRESH)
        # Not zeroed — the else branch normalizes x/w, y/h, and preserves conf
        np.testing.assert_allclose(result[:, 0], 320 / _W, rtol=1e-5)
        np.testing.assert_allclose(result[:, 1], 240 / _H, rtol=1e-5)
        np.testing.assert_allclose(result[:, 2], _CONF_THRESH, rtol=1e-5)

    def test_only_first_person_is_used(self) -> None:
        """When multiple persons are detected, only the first is used."""
        kpts_first = _make_kpts(x=10, y=20, conf=0.9)
        kpts_second = _make_kpts(x=300, y=400, conf=0.9)
        result = normalize_person_keypoints(
            (kpts_first, kpts_second), frame_w=_W, frame_h=_H, conf_threshold=_CONF_THRESH
        )
        np.testing.assert_allclose(result[:, 0], 10 / _W, rtol=1e-5)
        np.testing.assert_allclose(result[:, 1], 20 / _H, rtol=1e-5)


# ---------------------------------------------------------------------------
# discover_clips — directory walk (no video decoding)
# ---------------------------------------------------------------------------


def test_discover_clips_finds_avi_and_mp4_in_scenario_dirs(tmp_path):
    from pathlib import Path

    from training.extract_poses import discover_clips

    home = tmp_path / "Home"
    home.mkdir()
    (home / "video (2).avi").write_bytes(b"")
    (home / "video (1).mp4").write_bytes(b"")
    (home / "notes.txt").write_text("not a clip")
    (tmp_path / "NotAScenario").mkdir()
    (tmp_path / "NotAScenario" / "skip.avi").write_bytes(b"")

    clips = discover_clips(Path(tmp_path))

    assert [(c.scenario, c.video_path.name) for c in clips] == [
        ("Home", "video (2).avi"),
        ("Home", "video (1).mp4"),
    ]
