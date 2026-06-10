# Rule: `ml/` filesystem layout

> Scope: the `ml/` uv project. A standing convention every change must follow.
> Records the *operational* "where does this file go" rule; the *why* lives in
> [ADR-012](../decisions/ADR-012-ml-data-domain-first-layout.md) (and
> ADR-003/004/005/006/007 for the categories it inherits).

## `ml/data/` — domain-first, two tiers

```
ml/data/
├── nursing-home/          # domain: privately collected eldercare footage (operator-only)
│   ├── raw/               # originals — never modified in place
│   ├── processed/         # lossless processed clips (gold clips live here)
│   ├── poses/             # extracted keypoint caches (.npz)
│   └── annotated/         # rendered overlay videos
├── le2i/                  # domain: public training dataset
│   └── (same four roles)
├── eval/                  # cross-domain outputs (comparison CSVs/reports)
└── uploads/               # transient demo uploads — the only externally reachable input
```

- **Top level = domain (provenance).** One folder per data source.
- **Role subfolders are a fixed vocabulary**: exactly `{raw, processed, poses,
  annotated}`. No prefixes (`le2i_raw`), no synonyms (`npz/`), no per-domain
  inventions. A role that doesn't exist yet is simply absent.
- **`eval/` and `uploads/` are the only top-level non-domain entries.**

### Adding a new domain

Create `ml/data/{domain}/` (kebab-case provenance name) with whichever of the
four role folders you need. Point the relevant config constant
(`training/config.py`) at it. Nothing else — no new conventions, no registry.

## Where each file category lives

| File category | Home | Committed? | ADR |
|---------------|------|-----------|-----|
| Versioned first-party artifacts (+ `metadata.json`) | `ml/artifacts/<name>/<version>/` | metadata yes, `*.pt` no | ADR-003 |
| Curated comparison checkpoints | `ml/artifacts/pretrained/*/` | no (gitignored) | ADR-005 |
| Domain-bound data, any role | `ml/data/{domain}/{raw,processed,poses,annotated}` | no (gitignored) | ADR-012 |
| Cross-domain derived outputs | `ml/data/eval/` | no (gitignored) | ADR-012 |
| Transient demo uploads | `ml/data/uploads/` | no (gitignored) | ADR-012 |
| Frame-intake seam **code** | `ml/util/` | yes | ADR-006 |
| Upstream **weight cache** | `ml/weights/` | no (gitignored) | ADR-007 |

## Invariants

- **Weights, footage, and generated outputs are gitignored and NEVER committed
  or pushed.** `ml/data/`, `ml/weights/`, `*.pt`, and
  `ml/artifacts/pretrained/` are all in `.gitignore`. Run `git status` before
  every commit and confirm none are staged (inherited from ADR-004 via
  ADR-012).
- **Raw is sacred.** Files under any `{domain}/raw/` are never modified in
  place; processing writes lossless copies to `{domain}/processed/` only
  (inherited from ADR-004 via ADR-012).
- **`ml/data/` is partitioned domain-first.** Data goes in
  `{domain}/{role}/` with the fixed role vocabulary above. Cross-domain
  outputs go in `eval/`; nothing else lives at the top level. Never create a
  role-named or dataset-prefixed top-level folder (`ml/data/le2i_raw/`-style)
  — that drift is exactly what ADR-012 removed.
- **`nursing-home/` is operator-only.** It must never be listed or served by
  an externally deployed demo; `uploads/` is the only externally reachable
  input surface (ADR-012 Access Boundary; mechanism in
  [streamlit-demo.md](./streamlit-demo.md)).
- **The canonical physical store is the MAIN checkout's `ml/data/`.** Because
  `ml/data/` is gitignored, each worktree has its own (empty) copy by default.
  Worktrees use a symlink `<worktree>/ml/data → <main>/ml/data` (created by
  `git wt`). A missing link degrades silently in the demo (empty dropdown) but
  hard-crashes training scripts — if either happens in a worktree, check the
  link first.
- **Upstream pose weights load from `ml/weights/`, never the `ml/` root**, via
  `pose_weight_path(size)` (`ml/demo/model_modules.py`). The cache is
  disposable; never curate a weight into `ml/artifacts/` (ADR-007).

See [ADR-012](../decisions/ADR-012-ml-data-domain-first-layout.md) for the full
MECE partition and supersede relationships to ADR-004/ADR-007.
