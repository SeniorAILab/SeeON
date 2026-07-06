# Features Agent Rules

Own L0 pure feature transforms for geometry, pose normalization, and sliding-window feature extraction.

## Local Ownership

- `geometry.py`: IoU and greedy box matching.
- `pose_normalization.py`: per-person keypoint normalization.
- `window_features.py`: fall-window feature vectors and threshold constants.

## Imports

Allowed: standard library, numerical libraries, `contracts`, and local `features` modules.

Forbidden: `sources`, `runners`, `perception`, `domains`, `runtime`, `events`, `api`, `demo`, `training`, filesystem reads, camera/video I/O, model loading.

## Focused Tests

- `tests/test_features_window.py`
- `tests/test_import_dependency_ladder.py`
- `tests/test_vendor_drift.py`

## Gotchas

Training moved to eldercare-dataset-ops (ADR-0004); this package is vendored byte-identical into that repo's `ml/features/` (`tests/test_vendor_drift.py` enforces the two copies stay in sync). In this repo, `demo/temporal_module.py` is the only production consumer of `window_features`/`pose_normalization`. `window_features._D = 45` is the single source of truth for the feature dimension — do not derive it elsewhere; hardcode `45` as a literal with a comment if a consumer needs the constant (matches `demo/temporal_module.py` and `tests/test_features_window.py`).
