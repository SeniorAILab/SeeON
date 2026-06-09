---
slug: ml-asset-layout-cleanup
status: done
date: 2026-06-09
author: gobeumsu (via Claude Opus 4.8, omc-plan)
spec: ./spec.md
---

# Plan — ml/ Asset & Output Layout Cleanup

> **Pending approval.** Read-only until explicit "execute" / `/git-workflow-and-versioning`.
> Three atomic commits on a feature branch → PR → merge.

## Code grounding (verified)

- `ml/demo/model_modules.py:11-18` — `pose_weight_filename(size)` returns the **bare**
  `f"yolo26{size}-pose.pt"`. `YoloPoseModule.__init__` (`:29-32`) passes it to
  `YoloPoseRunner(model_path=...)`.
- `ml/demo/yolo_runtime.py:69-72` — `_load_yolo_model` does `YOLO(str(weight_path))`.
  A bare name → Ultralytics downloads the asset into **CWD** (`ml/`). This is the root cause.
- `ml/demo/annotated_video.py:13,16` — `ANNOTATED_VIDEO_DIR = DATA_DIR / "annotated"`.
  **Already under `ml/data/`** → D2 satisfied, no code change for outputs.
- `ml/demo/video_registry.py:9` — `DATA_DIR = .../ml/data`.
- `ml/tests/test_model_modules.py:8-10` — asserts `pose_weight_filename(size) == f"yolo26{size}-pose.pt"`.
  **Keep this contract intact** — the filename function stays the pure "seam swap" identity;
  location is layered on separately (see Step 1).
- `.gitignore` already ignores `weights/`, `ml/data/`, `ml/runs/`, `*.pt` → `ml/weights/`
  is ignored the moment it is created.

## Commit 1 — Relocate upstream weights to `ml/weights/` (chore)

**Goal:** weights load from `ml/weights/`, not the project root. Keep `pose_weight_filename`
pure; add location as a separate, testable layer.

1. In `ml/demo/model_modules.py`:
   - Add `from pathlib import Path` and a module constant
     `WEIGHTS_DIR: Final = Path(__file__).resolve().parent.parent / "weights"`.
   - Add `def pose_weight_path(size: str) -> Path: return WEIGHTS_DIR / pose_weight_filename(size)`
     (reuses `pose_weight_filename` → its existing test/contract is unchanged).
   - In `YoloPoseModule.__init__`, ensure the dir exists and pass the path:
     `WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)` then
     `YoloPoseRunner(model_path=str(pose_weight_path(size)), confidence=confidence)`.
2. Add a test in `ml/tests/test_model_modules.py`:
   - `pose_weight_path("n")` ends with `weights/yolo26n-pose.pt` and is absolute;
   - it stays consistent with `pose_weight_filename` (name component equality).
3. Physically move the already-downloaded weights:
   `mkdir -p ml/weights && git mv`-not-applicable (gitignored) → plain
   `mv ml/yolo26{n,s,m}-pose.pt ml/weights/`.
   - `ml/yolo11n-pose.pt` is a **stale pre-ADR-005 leftover** (code only uses yolo26).
     Default: **delete** it (gitignored, re-downloadable). Confirm at execution.
4. **Verification gate (must pass before commit):** run the demo headless / load
   `YoloPoseModule(size="n")` once and confirm the weight resolves from `ml/weights/`
   and **no new `*.pt` appears in `ml/` root**.
   - *Risk + fallback:* if Ultralytics ignores the absolute path for the asset *download*
     (downloads to CWD anyway), fall back to either (a) `ultralytics.settings.update(...)`
     to point its weights dir at `ml/weights/`, or (b) pre-place the file (we already have
     them) so only loading — not downloading — happens. Loading from an absolute path that
     exists is well-supported, so with the files pre-moved this path is low-risk.
5. Verify: `uv run --directory ml ruff check .` clean; `uv run --directory ml --group test pytest -q` green.

## Commit 2 — Delete orphaned `ml/runs/` (chore)

1. `rm -rf ml/runs/` (gitignored; no writer; findings already in ADR-005).
2. Optional tidy: drop the now-moot `ml/runs/` line from `.gitignore` (harmless either way;
   leave if it risks noise). The `weights/` and `ml/data/` lines stay.
3. Verify: `git status` shows nothing weight/footage/runs-shaped staged; ruff + pytest green
   (no test references `ml/runs/`).

## Commit 3 — Record the structure (docs)

1. **New `docs/decisions/ADR-007-ml-local-filesystem-layout.md`** (status ACCEPTED). Sections:
   - *Context* — the three inconsistencies; the two categories no prior ADR owns.
   - *Decision* — `ml/weights/` = ephemeral upstream weight cache; `ml/data/` output-role
     subdirs (`annotated/`, reserved `eval/`) = derived outputs.
   - *MECE boundary* (mandatory, per the always-MECE rule) — the full
     category→ADR partition table from spec.md, plus the two discriminators
     (permanence for weights vs artifacts/pretrained; data-role-by-subdir for data/).
     State explicitly what ADR-007 does **not** own (ADR-003/004/005/006 domains).
   - *Consequences* — root stays clean; future eval writers target `ml/data/eval/`;
     weights/outputs/footage remain gitignored (ADR-004 invariant).
   - *Alternatives rejected* — weights under `artifacts/pretrained/` (conflates cache with
     curated checkpoints); separate top-level `ml/outputs/` (rejected in favor of `data/`).
2. Update `docs/decisions/README.md` — add the ADR-007 index row.
3. Update `docs/architecture.md`:
   - directory tree: add `ml/weights/` row; annotate `ml/data/` subdirs as input-role
     (`raw/processed/uploads`) vs derived-role (`annotated/`, reserved `eval/`).
   - Key ADRs table: add the ADR-007 row.
4. **New `docs/rules/ml-filesystem-layout.md`** — standing operational convention
   (the "always" rule that complements ADR-007's "why"): a one-glance table of where each
   file category lives + the invariant "weights, footage, and generated outputs are
   gitignored and never committed/pushed." Cross-link ADR-007.
5. Verify: links resolve; ADR numbering correct (007 is next); decisions README + architecture
   + rules mutually consistent.

## Sequencing & guardrails

- Branch: `chore/ml-asset-layout-cleanup` off `main`.
- Order: Commit 1 (code+move) → Commit 2 (delete runs) → Commit 3 (docs). Each ruff-clean +
  pytest-green independently.
- `git status` before **every** commit — confirm no `*.pt`, no `ml/data/`, no `ml/runs/`
  content staged (ADR-004 invariant).
- PR via `/git-workflow-and-versioning`. Commit footer
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`; PR body footer
  `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- On merge: distill is already done (ADR-007 authored in Commit 3); move this folder
  `active/ → archive/` with `status: done`.

## Open confirmation (1)

- **`ml/yolo11n-pose.pt`** — delete (recommended, stale/unused) vs move to `ml/weights/`.
  Default in this plan: delete. Override at execution if you want it kept.
