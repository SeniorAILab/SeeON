"""Tests for training.data.windowing + integration across the full clip pipeline.

Covers:
- _compute_label: overlap thresholds (0%, 49%, 50%, 100%), ADL clips
- WindowDataset: short-clip padding, features mode
- split(): disjoint clip-id sets (leakage guard)
- Integration seam: npz encoding (np.bytes_) -> load_clip_metas -> WindowDataset

All fixtures are synthetic; no real Le2i data or YOLO weights are loaded.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np

from training.config import KPT_VECTOR_DIM, T_WINDOW
from training.data.le2i import _npz_scalar_to_str, load_clip_metas
from training.data.windowing import WindowDataset, _compute_label

# ---------------------------------------------------------------------------
# Fixture helpers
# ---------------------------------------------------------------------------


def _write_npz(
    path: Path,
    n_frames: int,
    clip_id: str,
    scenario: str = "Coffee_room",
    fps: float = 25.0,
) -> None:
    """Write a synthetic .npz using the exact schema produced by extract_poses."""
    np.savez(
        path,
        keypoints=np.zeros((n_frames, 17, 3), dtype=np.float32),
        clip_id=np.bytes_(clip_id.encode()),
        scenario=np.bytes_(scenario.encode()),
        fps=np.float32(fps),
    )


def _write_annotation(path: Path, start: int, end: int) -> None:
    """Write a two-line Le2i annotation file (start == 0 signals ADL)."""
    path.write_text(f"{start}\n{end}\n")


# ---------------------------------------------------------------------------
# Unit: _compute_label
# ---------------------------------------------------------------------------


class TestComputeLabel:
    """Directly exercises the label computation math — no I/O needed."""

    def test_adl_none_interval_always_zero(self) -> None:
        assert _compute_label(0, None) == 0
        assert _compute_label(10, None) == 0

    def test_0_percent_overlap_label_0(self) -> None:
        # window [0, 30),  fall [31, 60] — no intersection
        assert _compute_label(0, (31, 60)) == 0

    def test_49_percent_overlap_label_0(self) -> None:
        # window [0, 30),  fall [16, 50]
        # overlap = min(30, 51) - max(0, 16) = 30 - 16 = 14
        # 14 / 30 ≈ 0.467 < 0.5  → label 0
        assert _compute_label(0, (16, 50)) == 0

    def test_50_percent_overlap_label_1(self) -> None:
        # window [0, 30),  fall [15, 50]
        # overlap = min(30, 51) - max(0, 15) = 30 - 15 = 15
        # 15 / 30 = 0.5 ≥ 0.5  → label 1
        assert _compute_label(0, (15, 50)) == 1

    def test_100_percent_overlap_label_1(self) -> None:
        # window [10, 40),  fall [1, 50]
        # overlap = min(40, 51) - max(10, 1) = 40 - 10 = 30
        # 30 / 30 = 1.0 ≥ 0.5  → label 1
        assert _compute_label(10, (1, 50)) == 1


# ---------------------------------------------------------------------------
# Seam check: np.bytes_ clip_id round-trip
# ---------------------------------------------------------------------------


class TestNpzClipIdEncodingSeam:
    """Verify load_clip_metas decodes the np.bytes_ clip_id correctly.

    extract_poses stores clip_id as np.bytes_(clip_id.encode()).  A naive
    str(data['clip_id']) returns the numpy repr ("np.bytes_(b'clip01')") and
    silently breaks annotation lookup (every clip treated as ADL).  The loader
    routes the scalar through _npz_scalar_to_str, which must round-trip exactly.
    """

    def test_loader_decodes_clip_id_to_original_string(self, tmp_path: Path) -> None:
        expected = "clip01"
        npz_path = tmp_path / f"{expected}.npz"
        _write_npz(npz_path, n_frames=5, clip_id=expected)
        data = np.load(npz_path, allow_pickle=False)
        assert _npz_scalar_to_str(data["clip_id"]) == expected

    def test_loaded_clip_meta_carries_decoded_clip_id(self, tmp_path: Path) -> None:
        expected = "clip01"
        _write_npz(tmp_path / f"{expected}.npz", n_frames=5, clip_id=expected)
        metas = load_clip_metas(tmp_path, annotation_dir=None)
        assert len(metas) == 1
        assert metas[0].clip_id == expected


# ---------------------------------------------------------------------------
# Integration: load_clip_metas → WindowDataset
# ---------------------------------------------------------------------------


class TestWindowDatasetIntegration:
    def test_fall_window_gets_label_1_via_full_pipeline(self, tmp_path: Path) -> None:
        """Integration: extract_poses npz schema → load_clip_metas → WindowDataset label."""
        pose_dir = tmp_path / "poses"
        ann_dir = tmp_path / "annotations"
        pose_dir.mkdir()
        ann_dir.mkdir()

        clip_id = "clip_fall"
        # 30 frames → exactly one window at start=0
        _write_npz(pose_dir / f"{clip_id}.npz", n_frames=T_WINDOW, clip_id=clip_id)
        # fall [15, 50]: overlap with window [0, 30) = 15 frames (50%) → label 1
        _write_annotation(ann_dir / f"{clip_id}.txt", start=15, end=50)

        metas = load_clip_metas(pose_dir, annotation_dir=ann_dir)
        assert len(metas) == 1
        meta = metas[0]
        assert meta.fall_interval == (15, 50), (
            f"Annotation not loaded for clip '{clip_id}'. "
            f"Likely seam bug: load_clip_metas resolved clip_id as "
            f"{meta.clip_id!r} instead of '{clip_id}', so the annotation "
            f"file lookup failed and fall_interval defaulted to None."
        )

        ds = WindowDataset(metas, mode="sequence")
        assert len(ds) == 1
        _, label = ds[0]
        assert label == 1

    def test_adl_clip_all_labels_zero(self, tmp_path: Path) -> None:
        pose_dir = tmp_path / "poses"
        ann_dir = tmp_path / "annotations"
        pose_dir.mkdir()
        ann_dir.mkdir()

        clip_id = "clip_adl"
        _write_npz(pose_dir / f"{clip_id}.npz", n_frames=T_WINDOW, clip_id=clip_id)
        # start=0 signals ADL; parse_fall_interval returns None
        _write_annotation(ann_dir / f"{clip_id}.txt", start=0, end=0)

        metas = load_clip_metas(pose_dir, annotation_dir=ann_dir)
        assert len(metas) == 1
        assert metas[0].fall_interval is None

        ds = WindowDataset(metas, mode="sequence")
        for i in range(len(ds)):
            _, label = ds[i]
            assert label == 0, f"ADL window {i} has unexpected label {label}"

    def test_short_clip_produces_exactly_one_padded_window(self, tmp_path: Path) -> None:
        """A clip shorter than T_WINDOW yields exactly one zero-padded window."""
        pose_dir = tmp_path / "poses"
        pose_dir.mkdir()

        n_frames = T_WINDOW - 5  # shorter than T
        clip_id = "clip_short"
        _write_npz(pose_dir / f"{clip_id}.npz", n_frames=n_frames, clip_id=clip_id)

        # No annotation_dir → all ADL; we only care about count and shape
        metas = load_clip_metas(pose_dir)
        ds = WindowDataset(metas, mode="sequence")

        assert len(ds) == 1, f"Expected 1 window for short clip, got {len(ds)}"
        x, label = ds[0]
        assert x.shape == (T_WINDOW, KPT_VECTOR_DIM)
        assert x.dtype == np.float32
        # The last (T_WINDOW - n_frames) rows must be zero-padded
        np.testing.assert_array_equal(x[n_frames:], 0.0)
        # The first n_frames rows are the actual (zero) keypoints
        np.testing.assert_array_equal(x[:n_frames], 0.0)

    def test_nested_annotation_layout_resolves(self, tmp_path: Path) -> None:
        """Form (2): annotation_dir/{scenario}/Annotation_files/{stem}.txt is found.

        Real Le2i stores annotations at this nested path; form (1) flat lookup
        must not shadow it when the flat file does not exist.
        """
        pose_dir = tmp_path / "poses"
        ann_dir = tmp_path / "le2i_raw"
        pose_dir.mkdir()

        scenario = "Coffee_room"
        stem = "video_fall"
        clip_id = f"{scenario}/{stem}"

        # NPZ filename uses '__' separator (as _npz_stem does); internal clip_id has '/'.
        _write_npz(
            pose_dir / f"{scenario}__{stem}.npz",
            n_frames=T_WINDOW,
            clip_id=clip_id,
            scenario=scenario,
        )

        # Write annotation in the nested Le2i location — NOT in the flat location.
        ann_subdir = ann_dir / scenario / "Annotation_files"
        ann_subdir.mkdir(parents=True)
        _write_annotation(ann_subdir / f"{stem}.txt", start=15, end=50)

        metas = load_clip_metas(pose_dir, annotation_dir=ann_dir)
        assert len(metas) == 1
        assert metas[0].fall_interval == (15, 50), (
            f"Nested annotation layout (form 2) not resolved; "
            f"got fall_interval={metas[0].fall_interval!r}"
        )

    def test_split_produces_disjoint_clip_id_sets(self, tmp_path: Path) -> None:
        """split() must produce clip-id–disjoint train/test sets (leakage guard)."""
        pose_dir = tmp_path / "poses"
        pose_dir.mkdir()

        n_clips = 8  # 25% → 2 test clips, 6 train clips
        for i in range(n_clips):
            _write_npz(
                pose_dir / f"clip{i:02d}.npz",
                n_frames=T_WINDOW,
                clip_id=f"clip{i:02d}",
            )

        metas = load_clip_metas(pose_dir)
        assert len(metas) == n_clips

        ds = WindowDataset(metas, mode="features")
        train_ds, test_ds = ds.split(test_fraction=0.25)

        train_ids = {m.clip_id for m in train_ds._clip_metas}  # noqa: SLF001
        test_ids = {m.clip_id for m in test_ds._clip_metas}  # noqa: SLF001

        assert len(train_ids) > 0, "Train set must be non-empty"
        assert len(test_ids) > 0, "Test set must be non-empty"
        intersection = train_ids & test_ids
        assert intersection == set(), (
            f"Clip-level leakage: {intersection} appear in both splits"
        )
        assert train_ids | test_ids == {m.clip_id for m in metas}, (
            "All clips must appear in exactly one split"
        )
