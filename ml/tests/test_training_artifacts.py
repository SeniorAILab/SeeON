"""Unit-level smoke test for training.train.run().

Verifies that the dataset-assembly + single-RF-artifact-write path works
end-to-end on a tiny synthetic clip set, without any real Le2i data or
YOLO weights.  All I/O is confined to pytest's tmp_path.

Checks:
- model.pkl and metadata.json are written under artifact_dir("rf").
- metadata.json contains a parseable operating_threshold float.
- The test completes in a few seconds (RF on synthetic data, no nets).
"""

from __future__ import annotations

from pathlib import Path

import numpy as np

from training.config import T_WINDOW
from training.metadata import load_metadata  # noqa: E402 — after fixture helpers would break isort

# ---------------------------------------------------------------------------
# Synthetic fixture helpers (mirrored from test_training_windowing.py)
# ---------------------------------------------------------------------------


def _write_npz(
    path: Path,
    n_frames: int,
    clip_id: str,
    scenario: str = "Coffee_room",
    fps: float = 25.0,
) -> None:
    np.savez(
        path,
        keypoints=np.zeros((n_frames, 17, 3), dtype=np.float32),
        clip_id=np.bytes_(clip_id.encode()),
        scenario=np.bytes_(scenario.encode()),
        fps=np.float32(fps),
    )


def _write_annotation(path: Path, start: int, end: int) -> None:
    path.write_text(f"{start}\n{end}\n")


# ---------------------------------------------------------------------------
# Smoke test
# ---------------------------------------------------------------------------


class TestTrainRunRfSynthetic:
    """Dataset-assembly + single-RF-artifact-write on a synthetic clip set."""

    def test_rf_artifact_written_with_metadata(self, tmp_path: Path) -> None:
        """run() with models=['rf'] writes model.pkl + metadata.json to artifact_dir."""
        pose_dir = tmp_path / "poses"
        ann_dir = tmp_path / "annotations"
        artifact_base = tmp_path / "artifacts"
        pose_dir.mkdir()
        ann_dir.mkdir()

        # 4 fall clips + 4 ADL clips — enough for a non-trivial split.
        for i in range(4):
            cid = f"fall{i:02d}"
            _write_npz(pose_dir / f"{cid}.npz", n_frames=T_WINDOW * 3, clip_id=cid)
            _write_annotation(ann_dir / f"{cid}.txt", start=10, end=50)

        for i in range(4):
            cid = f"adl{i:02d}"
            _write_npz(pose_dir / f"{cid}.npz", n_frames=T_WINDOW * 3, clip_id=cid)
            _write_annotation(ann_dir / f"{cid}.txt", start=0, end=0)

        # Import here so we can patch ARTIFACT_BASE without affecting other tests.
        import training.metadata as _meta_module
        import training.train as _train_module

        orig_base = _meta_module.ARTIFACT_BASE
        orig_cfg_base = _train_module.ARTIFACT_BASE
        try:
            _meta_module.ARTIFACT_BASE = artifact_base
            _train_module.ARTIFACT_BASE = artifact_base

            _train_module.run(
                pose_dir=pose_dir,
                annotation_dir=ann_dir,
                smoke_n=None,
                models=["rf"],
            )
        finally:
            _meta_module.ARTIFACT_BASE = orig_base
            _train_module.ARTIFACT_BASE = orig_cfg_base

        rf_dir = artifact_base / "rf"
        assert (rf_dir / "model.pkl").exists(), "model.pkl not written"
        assert (rf_dir / "metadata.json").exists(), "metadata.json not written"

        meta = load_metadata(rf_dir)
        assert isinstance(meta.operating_threshold, float), (
            f"operating_threshold is not a float: {meta.operating_threshold!r}"
        )
        assert meta.framework == "sklearn"
        assert meta.feature_dim == 45
