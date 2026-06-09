# ADR-007: `ml/` Local Filesystem Layout — Weight Cache and Derived Outputs

## Status

Accepted.

## Date

2026-06-09

## Context

Three classes of local files had accumulated in `ml/` with no defined home, and
no existing ADR governed them:

1. **Upstream pose weights in the project root.** Ultralytics downloads
   `yolo26{n,s,m}-pose.pt` into the current working directory — which is `ml/`
   when the demo runs — because `YoloPoseModule` passed a bare filename. The
   weights sat loose in the root (gitignored, but visually polluting and with no
   defined location). A stale `yolo11n-pose.pt` from the pre-ADR-005 MediaPipe→YOLO
   transition lingered there too.
2. **Generated eval outputs under `ml/runs/`.** Timestamped folders of
   `detections.csv` / `results.json` / `summary.csv`, produced by a pose-probe
   script no longer present in the tree. Orphaned (no current writer); its
   findings were already distilled into ADR-005.
3. **Two competing homes for "generated data."** Annotated demo videos live
   under `ml/data/annotated/`, but the eval outputs lived under `ml/runs/` — a
   *sibling* of `data/`, not inside it. Two conventions for the same idea.

ADR-003 defines version-addressed **artifacts** (`ml/artifacts/<name>/<version>/`).
ADR-004 defines **source footage** (`ml/data/{raw,processed}`). ADR-005 keeps
curated **comparison checkpoints** (`ml/artifacts/pretrained/`). None of them
defines where an **ephemeral upstream weight cache** or a **derived/generated
output** belongs. This ADR fills exactly those two gaps — and only those.

This is a **filesystem-layout** decision: *where do non-artifact, non-source
local files live?* It does not reopen artifact addressing (ADR-003), footage
location (ADR-004), comparison-model curation (ADR-005), or code placement
(ADR-006).

## Decision

Two homes, one for each gap:

1. **Upstream weight cache → `ml/weights/`.** Ultralytics weights load and
   download into `ml/weights/`, never the project root. Wired in code via
   `WEIGHTS_DIR` + `pose_weight_path(size)` in `ml/demo/model_modules.py`, which
   layers the cache location on top of `pose_weight_filename` (kept a pure
   identity). The cache is **ephemeral and re-downloadable** — no metadata,
   gitignored, disposable.

2. **Derived / generated outputs → `ml/data/` output-role subdirs.** Generated
   artifacts live *inside* `ml/data/`, in subdirectories whose role is *output*:
   `ml/data/annotated/` (rendered overlay videos, already there) and a **reserved**
   `ml/data/eval/` for future eval writers. This ratifies the existing
   `annotated/` location and gives `runs/`-style outputs a home under `data/`
   going forward. The orphaned `ml/runs/` itself is deleted (its findings live in
   ADR-005).

### MECE boundary (mandatory — ADRs must be MECE)

Every file category under `ml/` maps to **exactly one** ADR. This ADR owns rows
5–6 and **nothing else**:

| # | File category | Location | Owning ADR |
|---|---------------|----------|-----------|
| 1 | Versioned first-party serving/training artifacts (+ `metadata.json`) | `ml/artifacts/<name>/<version>/` | ADR-003 |
| 2 | Curated third-party comparison checkpoints | `ml/artifacts/pretrained/*/` | ADR-005 |
| 3 | Source footage **inputs** | `ml/data/{raw,processed,uploads}` | ADR-004 |
| 4 | Frame-intake seam **code** | `ml/util/` | ADR-006 |
| 5 | **Upstream ephemeral weight cache** | **`ml/weights/`** | **ADR-007** |
| 6 | **Derived / generated outputs** | **`ml/data/{annotated,eval,…}`** | **ADR-007** |

Two discriminators keep the partition mutually exclusive:

- **`ml/weights/` vs `ml/artifacts/pretrained/` — by *permanence/curation*.**
  `weights/` is a re-downloadable cache with no metadata, deleted freely.
  `artifacts/pretrained/` holds deliberately *kept* checkpoints with
  `metadata.json` (ADR-003/005). An upstream weight is never curated into
  `artifacts/`; a curated checkpoint is never a transient cache entry.
- **Within `ml/data/` — by *data-role, signalled by subdir name*.**
  `{raw, processed, uploads}` are **inputs** (ADR-004, unchanged). `{annotated,
  eval, …}` are **derived outputs** (ADR-007). `ml/data/` is collectively
  exhausted by these two disjoint role-sets; no subdir is owned by both ADRs.

Explicitly **not** reopened here: artifact addressing (ADR-003), the footage
*input* convention (ADR-004), comparison-model selection/curation (ADR-005), and
code-module placement (ADR-006).

## Relationship to other ADRs

- **Complements ADR-004; does not supersede it.** ADR-004's decision — source
  footage lives in `ml/data/{raw,processed}` — stands unchanged. ADR-007 adds
  *output-role* subdirs alongside ADR-004's *input-role* ones; the subdir name is
  the discriminator, so the two never conflict.
- **Complements ADR-003 / ADR-005.** Neither the artifact layout nor the kept
  comparison checkpoints move. ADR-007 only introduces the disjoint `ml/weights/`
  cache and names the data-output convention.

## Alternatives Considered

### A. Weights under `ml/artifacts/pretrained/` (alongside comparison models)

**Rejected.** It conflates an ephemeral, re-downloadable cache with curated,
metadata-bearing checkpoints — collapsing the permanence discriminator and
breaking MECE with ADR-005. Ultralytics' bare-name auto-download also fights a
versioned `<name>/<version>/` layout, adding wiring for no benefit.

### B. A separate top-level `ml/outputs/` for derived data

**Rejected.** It creates a *third* data root (`data/` inputs, `outputs/` derived,
plus `artifacts/`) when the user's model is "generated data belongs in `data/`."
Keeping outputs inside `ml/data/` under role-named subdirs is the smaller change,
already half-true (`annotated/` was there), and keeps one gitignored `ml/data/`
boundary protecting both inputs and outputs.

### C. Leave weights in the root, keep `ml/runs/` (status quo)

**Rejected.** The root pollution and the two-competing-homes inconsistency are
exactly the problems this ADR exists to remove. `ml/runs/` has no writer and its
findings are already in ADR-005, so retaining it preserves only stale scratch.

## Consequences

**Positive:**

- The `ml/` root stays clean; weights have a single defined, gitignored home.
- One convention for generated data: everything derived lives under `ml/data/`,
  role-named. Future eval writers target `ml/data/eval/` without a new decision.
- The `ml/data/` gitignore boundary keeps weights, footage, and generated outputs
  out of version control by construction (ADR-004 invariant held).

**Negative / Trade-offs:**

- `ml/data/` now holds **both** inputs and outputs. Readers must rely on the
  subdir-role convention (input vs derived) rather than a top-level split; this
  ADR is the record of that convention.
- `ml/data/eval/` is reserved but unbuilt — a name promised ahead of its writer.
  Documented as reserved to prevent a future ad-hoc `runs/` reappearing.
