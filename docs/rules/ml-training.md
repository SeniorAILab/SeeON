# Rule: ML training pipeline conventions

> Scope: `ml/training/` and the artifacts it produces. Operational parameters,
> procedures, and contracts. The *decisions* behind them live in
> [ADR-013](../decisions/ml/ADR-013-le2i-training-pipeline-decisions.md)
> (dataset, labelling, threshold policy, gold-clip eval) on top of
> [ADR-009](../decisions/ml/ADR-009-fall-classification-strategy.md) (strategy) and [ADR-025](../decisions/ml/ADR-025-yolo26-pose-framework-adoption.md) (pose backbone; extracted from retired source ADR-005).

## Locked parameters (`training/config.py` is the single source of truth)

| Parameter | Value | Meaning |
|-----------|-------|---------|
| `T_WINDOW` | 30 | frames per sliding window |
| `STRIDE` | 5 | window step (must divide `T_WINDOW` — the live adapter asserts it) |
| `OVERLAP_THRESHOLD` | 0.5 | window is positive iff fall-interval overlap / T ≥ this |
| `CONF_THRESHOLD` | 0.2 | keypoint confidence gate (matches `demo/features.py`) |
| `SEED` | 42 | all stochastic steps |
| `TEST_SPLIT_FRACTION` | 0.25 | clip-wise held-out fraction |
| `GOLD8_POS_WINDOW_FRACTION` | 0.5 | clip predicted fall iff positive-window fraction ≥ this |
| `FEATURE_DIM` | 45 | defined by `training/data/features.py` — never derived elsewhere |

Changing `T_WINDOW`/`STRIDE`/`OVERLAP_THRESHOLD` invalidates every trained
artifact and the metadata contract — that is an ADR-013 supersede, not a tweak.

## Pipeline procedure

All commands run from `ml/`:

```bash
# 1. Extract pose caches (.npz) from a domain's clips (avi + mp4)
uv run --group training python -m training.extract_poses \
    --input-dir data/le2i/raw --output-dir data/le2i/poses

# 2. Train all three models (rf / lstm / transformer)
uv run --group training python -m training.train

# 3. Evaluate: metrics table + threshold calibration + gold-clip pass
uv run --group training python -m training.evaluate
```

- `extract_poses` uses the **same YOLO pose runtime and
  `normalize_person_keypoints`** as the live demo (person[0], x/w + y/h
  normalisation to [0, 1], confidence gate) — train↔serve skew prevention is a
  hard rule: any change to normalisation must land in *both* paths in the same
  commit.
- Labels: Le2i annotations are 1-based inclusive → converted to 0-based
  half-open `[f_start − 1, f_end)`. Unparseable annotation files are treated
  as ADL with a logged warning.
- The split asserts train/test clip-id disjointness on every dataset view —
  do not remove these asserts to "make it run".

## Operating threshold procedure

1. `train.py` writes `metadata.json` with `operating_threshold` defaulted.
2. `evaluate.py` computes precision/recall over held-out test windows, picks
   the **Recall ≥ 0.90** point, and overwrites `operating_threshold` in each
   artifact's `metadata.json`.
3. The demo adapter (`demo/temporal_module.py`) reads the threshold from
   `metadata.json` — never hardcode a threshold in demo code.

## `metadata.json` contract

Written by `train.py`, updated by `evaluate.py`, read by the demo. Schema:
`training/metadata.py::ModelMetadata` — `model_type`, `framework`, `window`,
`stride`, `input_shape`, `feature_dim`, `seed`, `classes`,
`operating_threshold`, plus contract keys `name`/`version`/`dataset`/`outputs`.

**Skew tolerance is mandatory:** `load_metadata` drops unknown keys and
defaults missing ones. A reader must never crash because the writer's schema
moved — the live demo depends on this.

## Evaluation outputs

- Held-out metrics + gold-clip results → CSVs under `ml/data/eval/`
  (`le2i-poc-results.csv`, `gold8-poc-results.csv`).
- The gold-clip pass (`--gold-clips-dir`, default: the nursing-home processed
  folder) is the domain-transfer check — report it alongside Le2i metrics,
  including `no_person_frac` per clip and the ADR-009 rule-based floor (0/8).
  Le2i metrics alone never gate a model.
