# Rule: `ml/` filesystem layout

> Scope: the `ml/` uv project. A standing convention every change must follow.
> Records the *operational* "where does this file go" rule; the *why* lives in
> [ADR-007](../decisions/ADR-007-ml-local-filesystem-layout.md) (and ADR-003/004/005/006).

## Where each file category lives

| File category | Home | Committed? | ADR |
|---------------|------|-----------|-----|
| Versioned first-party artifacts (+ `metadata.json`) | `ml/artifacts/<name>/<version>/` | metadata yes, `*.pt` no | ADR-003 |
| Curated comparison checkpoints | `ml/artifacts/pretrained/*/` | no (gitignored) | ADR-005 |
| Source footage **inputs** | `ml/data/{raw,processed,uploads}` | no (gitignored) | ADR-004 |
| Frame-intake seam **code** | `ml/util/` | yes | ADR-006 |
| Upstream **weight cache** | `ml/weights/` | no (gitignored) | ADR-007 |
| Derived / generated **outputs** | `ml/data/{annotated,eval,…}` | no (gitignored) | ADR-007 |

## Invariants

- **Weights, footage, and generated outputs are gitignored and NEVER committed
  or pushed.** `ml/data/`, `ml/weights/` (via `weights/`), `*.pt`, and
  `ml/artifacts/pretrained/` are all in `.gitignore`. Run `git status` before
  every commit and confirm none are staged (ADR-004 invariant).
- **Upstream pose weights load from `ml/weights/`, never the `ml/` root.** Code
  resolves them via `pose_weight_path(size)` (`ml/demo/model_modules.py`); the
  directory is created on demand. If a `*.pt` ever appears in the `ml/` root, the
  download target was misconfigured — fix the path, don't commit the file.
- **`ml/data/` subdirs are role-named.** Input-role: `{raw, processed, uploads}`.
  Derived/output-role: `{annotated, eval, …}`. New generated output goes under a
  derived-role subdir of `ml/data/` — never a new top-level `ml/runs/`-style sibling.
- **The weight cache is disposable.** Anything in `ml/weights/` is re-downloadable
  by Ultralytics; delete freely. Do not curate a weight into `ml/artifacts/` —
  curated checkpoints are a different category (permanence discriminator, ADR-007).

See [ADR-007](../decisions/ADR-007-ml-local-filesystem-layout.md) for the full
MECE partition and the discriminators that keep these categories disjoint.
