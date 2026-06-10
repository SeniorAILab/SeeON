"""Shared constants for the temporal fall-classifier training pipeline.

Dataset: Le2i Fall Detection Dataset (Charfi et al., 2013, Universite de
Bourgogne / Le2i lab). RGB .avi, single person, per-video annotation files give
the fall frame interval directly -- so labels are frame-interval based (no
activity-class scheme, no timestamp conversion).

Single source of truth for paths, window geometry, and labelling. All paths are
``__file__``-anchored so commands work regardless of the current working
directory. Imported by extract_poses, data/*, models/*, train, evaluate, and the
demo temporal adapter.
"""

from __future__ import annotations

from pathlib import Path

# --- Paths (anchored at the ml/ project root) ---
# ml/data/ is partitioned domain-first: {domain}/{raw,processed,poses,annotated}
# with cross-domain eval/ and transient uploads/ at the top level (ADR-012).
_ML_ROOT = Path(__file__).resolve().parent.parent  # -> ml/
DATA_ROOT = _ML_ROOT / "data"
POSE_CACHE_DIR = DATA_ROOT / "le2i" / "poses"
RAW_DATA_DIR = DATA_ROOT / "le2i" / "raw"
GOLD_CLIPS_DIR = DATA_ROOT / "nursing-home" / "processed"
ARTIFACT_BASE = _ML_ROOT / "models" / "fall"
EVAL_DIR = DATA_ROOT / "eval"

# --- Reproducibility ---
SEED = 42

# --- Window geometry (user-locked) ---
T_WINDOW = 30  # frames per window
STRIDE = 5  # window step
OVERLAP_THRESHOLD = 0.5  # window labelled fall iff |window n fall_interval| / T >= this

# --- Keypoints ---
N_KEYPOINTS = 17  # COCO-17
KPT_DIMS = 3  # (x, y, conf)
KPT_VECTOR_DIM = N_KEYPOINTS * KPT_DIMS  # 51-dim per frame for sequence models
CONF_THRESHOLD = 0.2  # match demo/features.py _CONF_THRESHOLD (keypoint conf gate)

# Source of truth: training.data.features.extract_window_features (D=45).
FEATURE_DIM: int = 45

# --- Le2i dataset layout / labelling ---
# Scenario sub-folders under the raw root. Coffee_room + Home carry the bulk of
# the fall annotations; Office / Lecture_room are sparser (kept for completeness).
LE2I_SCENARIOS = ("Coffee_room", "Home", "Office", "Lecture_room")
LE2I_FPS = 25.0  # documented Le2i capture rate (fallback when a header is absent)
# A video is a FALL clip iff its annotation gives a non-zero (start, end) frame
# interval; otherwise it is ADL (negative). No activity-class scheme -> the
# UP-Fall Activity-11 'Lying' collision (R9) does not apply to Le2i.

# --- Subject/clip-wise split (avoid same-clip leakage) ---
# Le2i has no subject IDs; split deterministically at the video level. Held-out
# fraction of sorted clip_ids forms the test set; windowing asserts the train/test
# clip-id sets are disjoint (the leakage guard, same intent as a subject split).
TEST_SPLIT_FRACTION = 0.25

# --- Evaluation ---
# Gold-8 clip is labelled fall iff (positive-window fraction) >= this (documented
# threshold tau, overridable on the evaluate CLI).
GOLD8_POS_WINDOW_FRACTION = 0.5
# Default operating threshold persisted into metadata until evaluate.py picks the
# validated Recall>=0.90 point; the live adapter reads it back from metadata.json.
DEFAULT_OPERATING_THRESHOLD = 0.5
