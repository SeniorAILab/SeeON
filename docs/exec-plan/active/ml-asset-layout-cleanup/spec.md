---
slug: ml-asset-layout-cleanup
status: pending-approval
date: 2026-06-09
author: gobeumsu (via Claude Opus 4.8, omc-plan)
---

# Spec — ml/ Asset & Output Layout Cleanup

## Problem

The `ml/` working tree accumulated three filesystem inconsistencies that no current
ADR governs:

1. **Loose upstream weights in the project root.** Ultralytics auto-downloads
   `yolo26{n,s,m}-pose.pt` (and a stale `yolo11n-pose.pt`) into the current working
   directory, which is `ml/` when the demo runs. They sit, gitignored, in the root —
   visually polluting it and having no defined home.
2. **`ml/runs/` is an orphan.** It holds timestamped eval outputs
   (`detections.csv` / `results.json` / `summary.csv`) plus `issue13-*` folders,
   produced by an earlier pose-probe script that no longer exists in the tree. No
   current code writes it. Its findings were already distilled into ADR-005.
3. **Generated outputs live in two different homes.** Annotated demo videos are under
   `ml/data/annotated/` (good), but the eval outputs are under `ml/runs/` (a sibling
   of `data/`, not inside it) — two competing conventions for "generated data."

The user also asks **which document** should record the resulting structure.

## Decisions (settled via interview, 2026-06-09)

| # | Question | Decision |
|---|----------|----------|
| D1 | Where do auto-downloaded upstream pose weights live? | Dedicated **`ml/weights/`** cache dir; Ultralytics configured to load/download there. |
| D2 | Placement philosophy for generated outputs (annotated, runs)? | **All under `ml/data/`** (matches "generated data belongs in data/"). |
| D3 | Fate of the orphaned `ml/runs/`? | **Delete** — gitignored local scratch, findings already in ADR-005, raw CSVs reproducible. |
| D4 | Which document records the restructure? | **New ADR-007** (+ `architecture.md` tree update + a `docs/rules/` layout convention). |

## MECE constraint (hard requirement)

ADR-007 **must be MECE** against ADR-003/004/005/006. It owns **only** the two
categories no prior ADR defines:

- (a) upstream **ephemeral weight cache** → `ml/weights/`
- (b) **derived/generated outputs** → `ml/data/` output-role subdirs

Explicit out-of-scope boundaries (each ml/ file category maps to exactly one ADR):

- Versioned first-party artifacts → **ADR-003** (`ml/artifacts/<name>/<version>/`)
- Curated comparison checkpoints → **ADR-005** (`ml/artifacts/pretrained/`)
- Source footage inputs → **ADR-004** (`ml/data/{raw,processed,uploads}`)
- Frame-intake seam code → **ADR-006** (`ml/util/`)

Discriminators that keep the partition clean:

- **weights/ vs artifacts/pretrained/** — *permanence/curation*. `weights/` = re-downloadable,
  no metadata, disposable cache. `artifacts/pretrained/` = deliberately kept checkpoints with
  `metadata.json`.
- **data/ input vs derived** — *data-role by subdir*. `{raw,processed,uploads}` = inputs (ADR-004);
  `{annotated,eval,…}` = derived outputs (ADR-007).

## Acceptance criteria

- AC-1: No `*.pt` weight files remain loose in `ml/` root; all live under `ml/weights/`.
- AC-2: The Streamlit demo loads pose weights from `ml/weights/` (verified: select a video,
  generate a native player, weight resolves from `ml/weights/` — no new file appears in `ml/` root).
- AC-3: `ml/runs/` is deleted.
- AC-4: `ml/data/annotated/` remains the home for generated demo videos (no regression).
- AC-5: ADR-007 exists, is ACCEPTED, and is MECE vs ADR-003/004/005/006 (boundary section present).
- AC-6: `docs/architecture.md` directory tree shows `ml/weights/` and the input-vs-derived
  split of `ml/data/`; Key-ADRs table lists ADR-007.
- AC-7: `docs/decisions/README.md` index lists ADR-007.
- AC-8: A `docs/rules/` layout-convention doc states the standing "where each file category lives,
  never commit weights/footage/outputs" rule.
- AC-9: `ml/weights/` and `ml/data/` (and the deleted `ml/runs/`) stay gitignored — nothing
  weight- or footage-shaped is ever staged (ADR-004 invariant held; `git status` confirms).
- AC-10: ruff clean + full pytest green at every commit.

## Non-goals

- No change to `ml/artifacts/` layout (ADR-003/005 domain, untouched).
- No new eval pipeline/writer — `ml/data/eval/` is a *convention reserved* by ADR-007, not built now.
- No change to `AGENTS.md` waypoint (it documents repo-root docs ontology, not `ml/` internals).
