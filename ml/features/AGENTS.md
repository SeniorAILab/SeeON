# Features Agent Rules

Own L0 pure feature transforms for geometry, pose normalization, and sliding-window feature extraction.

## Local Ownership

- `geometry.py`: IoU and greedy box matching.
- `pose_normalization.py`: per-person keypoint normalization.
- `window_features.py`: fall-window feature vectors and threshold constants.

## Imports

Allowed: standard library, numerical libraries, `contracts`, and local `features` modules.

Forbidden: `sources`, `runners`, `perception`, `domains`, `runtime`, `events`, `serving`, `demo`, `training`, filesystem reads, camera/video I/O, model loading.

## Focused Tests

- `tests/test_training_features.py`
- `tests/test_training_windowing.py`
- `tests/test_import_dependency_ladder.py`

## Gotchas

`training.data.features` delegates to `features.window_features`; keep feature dimensions compatible with `training.config.FEATURE_DIM` and serving model metadata.
