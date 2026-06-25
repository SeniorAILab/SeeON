# ADR-012: Domain-First Two-Tier Layout for `ml/data/`

## Status

Accepted. Supersedes retired source ADR-004 and ADR-007 for current `ml/data/` layout. Partially
superseded by [ADR-028](../common/ADR-028-demo-access-boundary.md), which extracted
the access-boundary clauses into `common/`; ADR-028 is in turn superseded by
[ADR-045](../common/ADR-045-streamlit-demo-local-only.md) (demo is local-only, the
`FALL_DEMO_MODE` access-mode branching is removed). The `FALL_DEMO_MODE` clause below is
preserved as historical context only. The deliberately deferred hook/script validation is
resolved by [ADR-016](../common/ADR-016-enforcement-timing-principle.md): layout conventions
are audit-tier, not hook-blocked.

Historical pre-MECE source ADRs ADR-004 and ADR-007 were folded into ADR-012 and ADR-015; their original bodies remain recoverable from git history.

## Date

2026-06-10

## Context

Retired source ADR-004 and ADR-007 partitioned `ml/data/` by **role only**: ADR-004 owned the
input-role subdirs `{raw, processed, uploads}`, ADR-007 owned the output-role
subdirs `{annotated, eval, …}`. The **provenance/domain axis was never
defined** — and that gap is exactly where the layout drifted: when the Le2i
public fall dataset arrived for temporal-model training (#40), `le2i_raw/` and
`le2i_poses/` appeared as ad-hoc top-level siblings outside any ADR's partition.

The project now holds (and will keep accumulating) data from **multiple
provenances with different handling requirements**:

- **nursing-home** — privately collected eldercare CCTV footage.
  Patient-adjacent, privacy-critical, must never be exposed outside the
  operator's machine. Used as the gold evaluation set today; intended for
  training/test use later.
- **le2i** — a public academic dataset used for training. Reusable across
  train/eval; no privacy constraint, but its derived poses must stay
  discoverable next to their source.
- Future public datasets (UP-Fall etc.) are expected to follow.

Each provenance produces the *same role spectrum* (originals, processed clips,
extracted pose caches, annotated renders), so role-only naming forces either
prefix mangling (`le2i_raw`) or collisions. Additionally, the Streamlit demo is
heading toward external deployment where outside testers run inference on their
own uploads — making the privacy boundary between collected footage and
externally reachable data a structural concern, not just an operational one.

## Decision

`ml/data/` becomes a **domain-first two-tier partition**:

```
ml/data/
├── {domain}/             # provenance: nursing-home/, le2i/, (future: upfall/, …)
│   ├── raw/              # originals — "raw is sacred", never modified in place
│   ├── processed/        # lossless processed clips
│   ├── poses/            # extracted keypoint caches (.npz)
│   └── annotated/        # rendered overlay videos
├── eval/                 # cross-domain outputs (model-comparison reports, CSVs)
└── uploads/              # transient demo uploads — domain-agnostic
```

1. **Top level = domain (provenance).** One folder per data source. Adding a
   dataset means adding one domain folder — never a new naming scheme.
2. **Role subfolders are a mandatory vocabulary**: exactly
   `{raw, processed, poses, annotated}` inside every domain. Ad-hoc names
   (`le2i_raw`-style prefixing, per-domain inventions) are forbidden; empty
   roles may simply not exist yet, but a role that exists must use the
   canonical name.
3. **Cross-domain outputs stay top-level in `eval/`** — a model-comparison
   report spans domains (e.g. trained on le2i, evaluated on nursing-home), so
   it belongs to no single domain.
4. **`uploads/` stays top-level** — transient, domain-agnostic intake from the
   demo. It is *not* a domain (no role subfolders) and is periodically
   disposable.
5. **Enforcement is convention-level this cycle** (this ADR + the rules doc);
   hook/script validation is deliberately deferred.

### Supersede scope — ADR-004 (partial)

- **Superseded:** the location rule "source footage inputs live in
  `ml/data/{raw, processed}`" → inputs live in
  `ml/data/{domain}/{raw, processed}`. (`uploads/` remains top-level,
  unchanged.)
- **Inherited unchanged (both invariants remain binding):**
  - **The gitignore boundary** — `ml/data/` is gitignored in its entirety;
    data and weights are never committed or pushed.
  - **"Raw is sacred"** — files under any `{domain}/raw/` are never modified
    in place; processing writes lossless copies to `{domain}/processed/`.

### Supersede scope — ADR-007 (partial, MECE table row 6)

- **Superseded:** row 6 of ADR-007's MECE partition table
  ("Derived / generated outputs → `ml/data/{annotated,eval,…}`") is replaced:
  domain-bound derived outputs (`annotated/`, and the newly named `poses/`)
  live **inside** `ml/data/{domain}/`; only genuinely cross-domain outputs live
  in top-level `ml/data/eval/`.
- **Inherited:** row 5 (`ml/weights/` upstream cache) and every discriminator
  ADR-007 defined against retired source ADR-003/005. The role axis itself survives — it is
  demoted from the *first* partition axis to the *second* (within-domain) axis.

### Updated MECE partition (replaces the ADR-007 table as the current map)

| # | File category | Location | Owning ADR |
|---|---------------|----------|-----------|
| 1 | Trained first-party models (+ `metadata.json`) | `ml/models/fall/<model_type>/` [^1] | ADR-015 |
| 2 | Third-party comparison checkpoints | `ml/models/fall/pretrained/*/` [^1] | ADR-015 |
| 3 | Domain-bound data, any role (inputs **and** derived) | `ml/data/{domain}/{raw,processed,poses,annotated}` | **ADR-012** |
| 4 | Cross-domain derived outputs | `ml/data/eval/` | **ADR-012** |
| 5 | Transient demo uploads | `ml/data/uploads/` | **ADR-012** |
| 6 | Frame-intake seam **code** | `ml/util/` | ADR-006 |
| 7 | Upstream ephemeral pose weight cache | `ml/models/pose/` [^1] | ADR-015 |

[^1]: Rows 1, 2, and 7 updated by [ADR-015](./ADR-015-ml-models-single-root.md), which
consolidated `ml/weights/`, `ml/artifacts/pretrained/`, and `ml/artifacts/fall-detector/`
into a single `ml/models/` root. Prior locations recorded in retired source ADR-003 §3 and retired source ADR-007 rows
1/2/5 are superseded.

## Access Boundary

> This section records the access-separation decision alongside the layout it
> constrains. Layout and access policy change at different rates — **this
> section may be extracted into its own ADR at deployment time** without
> reopening the layout decision.

- **`nursing-home/` is operator-only.** It contains patient-adjacent footage
  and must never be listed, served, or otherwise reachable from an
  externally deployed demo.
- **`uploads/` is the only externally reachable input surface.** In the
  deployed demo, an external tester may run inference **only on clips they
  uploaded in their own session**.
- **The demo mode mechanism fails safe:** `FALL_DEMO_MODE` defaults to
  `public` (internal sources hidden, session-scoped uploads only); local
  operator use requires the explicit opt-in `FALL_DEMO_MODE=operator`. A
  forgotten environment variable on a deployment must never expose
  nursing-home data.

## Alternatives Considered

### A. Keep role-first, quarantine external datasets only (`ml/data/external/le2i/…`)

**Rejected.** Asymmetric: nursing-home footage also needs a domain identity the
moment it is used for training/test alongside other sources (the user's stated
direction). Special-casing "external" recreates the undefined-axis gap one
level down and leaves `ml/data/raw` ambiguous (raw *what*?).

### B. A separate dataset root outside `ml/data/` (`ml/datasets/`)

**Rejected.** Creates a third data root next to `data/` and `artifacts/`,
splitting the single gitignored boundary that protects all local media — the
same reasoning that retired source ADR-007 used to reject `ml/outputs/`. One root, one ignore
rule, one privacy perimeter.

### C. Domains with free-form subfolders (no mandatory vocabulary)

**Rejected.** Per-domain drift (`le2i_raw` vs `raw`, `poses` vs `npz/`) is the
exact failure this ADR removes. A fixed vocabulary keeps tooling generic: any
code can enumerate `{domain}/processed/` without per-dataset adapters.

## Consequences

**Positive:**

- New datasets land predictably: one new domain folder, zero new conventions.
- The demo clip picker enumerates `ml/data/{domain}/{raw,processed}`
  generically — dropdown sources need no per-dataset wiring.
- The privacy boundary is expressed structurally (domain folder + uploads-only
  external surface), not just procedurally.
- Derived data sits next to its source (`le2i/poses/` beside `le2i/raw/`),
  so reuse across train/eval/demo needs no cross-referencing.

**Negative / Trade-offs:**

- One-time physical migration plus a coordinated code-path update
  (`training/config.py`, `extract_poses`, `evaluate`, `demo/video_registry`).
- Because `ml/data/` is gitignored, each git worktree has its **own** copy by
  default. The canonical store is the **main checkout's** `ml/data/`;
  worktrees link to it (operational detail in
  `docs/rules/ml-filesystem-layout.md`). A worktree without the link sees
  empty data — demo degrades silently, training scripts fail fast.
- Enforcement is convention-only this cycle; a misnamed folder is caught by
  review, not tooling. Hook validation is an explicit follow-up.
