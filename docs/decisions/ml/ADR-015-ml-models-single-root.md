# ADR-015: `ml/models/` Single Root — Consolidating Weights, Artifacts, and Pretrained Checkpoints

## Status

Accepted. **Partially supersedes ADR-003** (§3 artifact layout — `ml/artifacts/<name>/<version>/`
replaced by `ml/models/fall/<model_type>/`) and **ADR-007** (`ml/weights/` → `ml/models/pose/`;
`ml/artifacts/pretrained/` → `ml/models/fall/pretrained/`). ADR-012 MECE rows 1, 2, and 7 are
stale; ADR-015 is the current map for all model-related paths.

## Date

2026-06-10

## Context

Three separate locations held model-class files with no single owning root:

1. **`ml/weights/`** — Ultralytics auto-download target for YOLO26-pose weights (ephemeral,
   re-downloadable). Governed by ADR-007 row 5.
2. **`ml/artifacts/fall-detector/`** — Trained fall-classifier artifacts (`rf/`, `lstm/`,
   `transformer/`). The ADR-003 Triton-inspired `<name>/<version>/` layout was unused in practice
   (`version` was always `poc`) and the `fall-detector/` middle level was redundant.
3. **`ml/artifacts/pretrained/`** — Third-party comparison checkpoints. Governed by ADR-005, but
   co-located with trained outputs despite being downloaded, not trained.

Serving code used a `version` parameter to address artifacts, which matched the old ADR-003 path
formula but misnamed the semantics (the parameter selects *which model type* to load, not a
version).

Two audit items from #66 remained open:
- ADR-009 line ~136 referenced the stale `ml/artifacts/<name>/<version>/` template.
- ADR-012 MECE row 1 listed `ml/artifacts/<name>/<version>/` as the first-party location.

## Decision

Consolidate all model-class files under a **single root `ml/models/`** partitioned by function:

```
ml/models/
├── pose/                      # YOLO26-pose weight cache (ephemeral, re-downloadable)
│   ├── yolo26{n,s,m,l,x}-pose.pt
│   └── metadata.json
└── fall/                      # fall-detection models (function axis)
    ├── random-forest/         # trained sklearn RF (formerly rf/)
    ├── lstm/                  # trained PyTorch LSTM
    ├── transformer/           # trained PyTorch Transformer
    └── pretrained/            # third-party comparison checkpoints
        ├── melihuzunoglu_yolo11/
        ├── syed_yolo11_le2i/
        └── tomotsugu_yolov8/
```

### 1. Layout rationale

- **One root, one gitignore rule.** `ml/models` replaces three gitignore entries with one.
- **Top level = function axis only** (`{pose, fall}`). Ephemeral/durable and origin distinctions
  are expressed in `metadata.json`, not directory structure.
- **No version directory.** Version is a `metadata.json` internal field, not a path component.
  The old `<name>/<version>/` layout was Triton-inspired but unused: the version was always `poc`
  and never used to select between coexisting versions at runtime.
- **`rf` → `random-forest` rename.** The short key is replaced by the descriptive kebab name,
  making folder names, CLI/config keys, and `model_type` values self-documenting.

### 2. `metadata.json` mandate

Every model folder (`pose/`, `fall/<type>/`, `fall/pretrained/<name>/`) must contain
`metadata.json` with at minimum:

| Field | Required for | Value |
|-------|-------------|-------|
| `source` | all | `"downloaded"` \| `"trained"` \| `"third-party"` |
| `reacquire` | all | download URL or `python -m training.train` command to reproduce |
| `version` | trained artifacts | existing version string (e.g. `"poc"`) |

Existing fields in trained and pretrained `metadata.json` files are preserved; `source` and
`reacquire` are additive enrichment.

### 3. Code changes

| File | Change |
|------|--------|
| `serving/model.py` | `version` param → `model_type`; path `ml/models/fall/<model_type>/` |
| `training/config.py` | `ARTIFACT_BASE = ml/models/fall/` |
| `training/train.py` + `evaluate.py` | `"rf"` key → `"random-forest"` throughout |
| `demo/model_modules.py` | `WEIGHTS_DIR = ml/models/pose/` |
| `demo/temporal_module.py` | `_KEY_TO_ARTIFACT["random_forest"]` → `"random-forest"` (was `"rf"`) |

### 4. Worktree infrastructure

`scripts/git-guard/wt.sh` gains `link_ml_models()` (mirrors `link_ml_data()`) that auto-symlinks
`<worktree>/ml/models → <main-checkout>/ml/models` on `git wt <issue#>`. The physical store stays
in the main checkout; worktrees access it via the symlink.

## Alternatives Considered

### A. Keep `ml/weights/` and `ml/artifacts/` as separate roots

**Rejected.** Two roots require two gitignore rules and two worktree symlinks. The
ephemeral/durable distinction belongs in `metadata.json source`, not in a path prefix. One root
gives a single gitignore boundary and a single worktree symlink.

### B. Use `ml/artifacts/` as the single root (move pose weights there)

**Rejected.** "Artifacts" implies produced-by-training; YOLO26-pose weights are downloaded, not
trained. The neutral term `models/` covers all model-class files regardless of origin.

### C. Keep version in the path (`ml/models/fall/random-forest/poc/`)

**Rejected.** The `poc` version string never changed and was never used to select between versions
at runtime. A version directory is meaningful only when multiple trained versions coexist and need
independent paths; that is not the current situation. Version belongs in `metadata.json`.

## Relationship to Other ADRs

- **Partially supersedes retired source ADR-003 §3** (artifact path formula). The serving/training lifecycle, ML/backend boundary, and demo/product boundary now live in ADR-022, ADR-023, and ADR-024.
- **Partially supersedes retired source ADR-007** (rows 1, 2, 5 of the ADR-007 MECE table —
  first-party artifacts, pretrained checkpoints, weight cache). Its exact source body remains recoverable from git history and mapped in the README coverage matrix.
- **Updates ADR-012 MECE table** rows 1, 2, and 7 (see table below). `ml/data/` layout
  (ADR-012 primary decision), the `ModelModule` seam (retired source ADR-005; current authority ADR-026), and the worktree enforcement
  policy (ADR-008) are not touched.
- **Implementation tracked** in GitHub issue **#56**.

### Updated MECE table (rows 1, 2, 7 replacing ADR-012 entries)

| # | File category | Location | Owning ADR |
|---|---------------|----------|-----------|
| 1 | Trained first-party models (+ `metadata.json`) | `ml/models/fall/<model_type>/` | **ADR-015** |
| 2 | Third-party comparison checkpoints | `ml/models/fall/pretrained/*/` | **ADR-015** |
| 7 | Upstream ephemeral pose weight cache | `ml/models/pose/` | **ADR-015** |

Rows 3–6 from ADR-012 are unchanged.
