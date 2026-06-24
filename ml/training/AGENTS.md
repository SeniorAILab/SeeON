# Training Agent Rules

Own batch training, evaluation, metadata, hyperparameter wiring, pose extraction, and training datasets.

## Local Ownership

- `config.py`: training constants and data/artifact roots.
- `data/`: dataset loading, windowing, feature extraction delegation, nursing-home labels.
- `models/`: trainable model catalog and implementations.
- `train.py`, `evaluate.py`, `evaluate_nh.py`, `extract_poses.py`: batch lifecycle commands.
- `metadata.py`, `_tracking.py`, `hp.py`: artifacts, tracking helpers, hyperparameters.

## Imports

Allowed: `training`, `contracts`, `features`, `sources`, and `runners`.

Forbidden: `perception`, `domains`, `runtime`, `events`, `api`, `demo`.

## Focused Tests

- `tests/test_training_features.py`
- `tests/test_training_windowing.py`
- `tests/test_training_models.py`
- `tests/test_training_artifacts.py`
- `tests/test_training_extract.py`
- `tests/test_evaluate_nh_pose_size.py`
- `tests/test_import_dependency_ladder.py`

## Gotchas

Serving must not import `training`. If a runtime feature needs trained metadata, write it into the artifact metadata consumed by api or demo instead of crossing the lifecycle boundary.
