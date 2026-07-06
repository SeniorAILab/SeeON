# Rule: ML training pipeline conventions (moved to eldercare-dataset-ops)

> Scope: this file is a stub, kept for link stability. The training pipeline
> it used to document — `ml/training/` (pose extraction, models, train/eval
> scripts) and `ml/experiments/` code — no longer lives in this repo. Per
> ADR-0004 (`eldercare-dataset-ops/docs/adr/0004-migration-sequencing-parity-gate.md`,
> plus ADR-0001 and ADR-0006 in the same repo), the pipeline, its locked
> parameters, and the current dataset/labelling/threshold/gold-clip-evaluation
> decisions now live in **eldercare-dataset-ops** (`ml/training/`, `ml/hp.py`,
> `ml/AGENTS.md`). Read and run the pipeline there.

## What stays in this repo

`eldercare-fall-ai` keeps only what the live demo/worker need at inference
time — no training code, no `--group training` dependency group:

- `ml/artifact_metadata/` — the read-side `ModelMetadata` schema
  (`metadata.json` contract: `model_type`, `framework`, `window`, `stride`,
  `input_shape`, `feature_dim`, `seed`, `classes`, `operating_threshold`,
  `name`/`version`/`dataset`/`outputs`, `source`/`reacquire`). Kept in
  lockstep with dataset-ops's `training/metadata.py` (the write side) by
  `ml/tests/test_vendor_drift.py`.
- `ml/contracts/`, `ml/features/` — pure types/math, vendored byte-identical
  into dataset-ops's `ml/contracts/`, `ml/features/` (same test enforces
  this both ways).
- A few locked training-pipeline constants duplicated as literals where the
  live path needs them — e.g. `demo/temporal_module.py`'s
  `_CONF_THRESHOLD = 0.2` and `_KPT_VECTOR_DIM` (17 keypoints × 3 dims), and
  `features/window_features.py`'s `_D = 45` (feature dimension, "do not
  derive D from anywhere else" per that module's own docstring). These must
  stay numerically identical to dataset-ops's `training/config.py`
  (`CONF_THRESHOLD`, `N_KEYPOINTS`, `KPT_DIMS`, `FEATURE_DIM`), but this repo
  no longer imports that module to get them — they are load-bearing literals
  now, not a shared import.

`ml/models/fall/*` (gitignored, populated by an operator copying an artifact
directory built in dataset-ops) is still the read path: `demo/temporal_module.py`
and `demo/thresholds.py` load `metadata.json` and the serialized weights from
there via `artifact_metadata.artifact_dir`/`load_metadata`.

## Where the old sections went

The locked-parameter table, pipeline procedure (`extract_poses` →
`train` → `evaluate`), operating-threshold procedure, and evaluation-output
conventions this file used to document are unchanged in substance — they now
live in eldercare-dataset-ops's copy of this rule (or its `ml/AGENTS.md` /
ADR-0004 if that repo has not split them into a standalone rule file). Do not
re-author them here; this file only tracks what changed on the fall-ai side.
