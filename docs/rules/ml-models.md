# Rule: `ml/models/` layout and metadata contract

> Scope: the `ml/` uv project. A standing convention every change must follow.
> Records the *operational* "where does this model file go" rule; the *why* lives
> in [ADR-015](../decisions/ml/ADR-015-ml-models-single-root.md).

## Layout

```
ml/models/
├── pose/                      # YOLO26-pose weight cache (ephemeral, re-downloadable)
│   ├── yolo26{n,s,m,l,x}-pose.pt
│   └── metadata.json
└── fall/                      # fall-detection models (function axis)
    ├── random-forest/         # trained sklearn RF
    ├── lstm/                  # trained PyTorch LSTM
    ├── transformer/           # trained PyTorch Transformer
    └── pretrained/            # third-party comparison checkpoints
        ├── melihuzunoglu_yolo11/
        ├── syed_yolo11_le2i/
        └── tomotsugu_yolov8/
```

- **Top level = function axis** (`pose`, `fall`). Never add a new top-level folder for
  ephemeral/durable or origin distinctions — those go in `metadata.json`.
- **`ml/models/` is gitignored in its entirety** (single `.gitignore` entry). No file
  inside `ml/models/` is ever committed or pushed.

## `metadata.json` required fields

Every model folder (`pose/`, `fall/<type>/`, `fall/pretrained/<name>/`) **must** contain
a `metadata.json` file with at minimum:

| Field | Type | Required for | Meaning |
|-------|------|-------------|---------|
| `source` | string | all | `"downloaded"` \| `"trained"` \| `"third-party"` |
| `reacquire` | string | all | How to reproduce: download URL or `python -m training.train` command |
| `version` | string | trained artifacts | version tag (e.g. `"poc"`) |

Additional model-specific fields (e.g. `model_type`, `framework`, `window`) are allowed and
encouraged; see existing `metadata.json` files for examples.

## Reacquire contract

The `reacquire` field is the **single source of truth** for how to reproduce a file that is
absent (e.g. on a fresh clone or new worktree):

- **`source: "downloaded"`** — `reacquire` is the direct download URL. Pose weights are
  auto-downloaded by Ultralytics on first use via `YoloPoseRunner`; `reacquire` documents
  the upstream source for auditability.
- **`source: "trained"`** — `reacquire` is the exact `uv run` training command. Running it
  in the `ml/` project root produces `model.pkl` or `model.pt` plus `metadata.json` in the
  correct directory.
- **`source: "third-party"`** — `reacquire` is the upstream weight URL. A one-line `curl`
  or `wget` to that URL reproduces `best.pt`.

## Worktree rule

`ml/models/` is gitignored and physically lives in the **main checkout only**. Each worktree
gets a symlink `<worktree>/ml/models → <main-checkout>/ml/models`, created automatically by
`git wt <issue#>` via `link_ml_models()` in `scripts/git-guard/wt.sh`.

- If the symlink is missing, serving code reports all trained models as unavailable and
  `pose_weight_path()` resolves to a non-existent path — check the link first.
- Never create real directories under `<worktree>/ml/models/`; they will shadow the symlink.

## Invariants

- **Never commit any file under `ml/models/`** — weights (`.pt`, `.pkl`), metadata, and
  checkpoints are all gitignored. Run `git status` before every commit and confirm none are
  staged.
- **One `metadata.json` per model folder** — adding a new model means adding a new folder
  with a `metadata.json` that satisfies the required-fields contract above.
- **`model_type` values are kebab-case** — `random-forest`, `lstm`, `transformer`. The demo
  uses `random_forest` (underscore) as a UI key; the training pipeline and `metadata.json`
  use the kebab form as the on-disk key. The mapping lives in
  `demo/temporal_module.py:_KEY_TO_ARTIFACT`.

See [ADR-015](../decisions/ml/ADR-015-ml-models-single-root.md) for the full design rationale and
supersede relationships to ADR-003/ADR-007.
