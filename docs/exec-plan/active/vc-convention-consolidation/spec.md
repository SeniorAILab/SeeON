---
slug: vc-convention-consolidation
issue: 393
status: active
author: gobeumsu
created: 2026-06-27
---

# Spec — Version-control convention consolidation (#393 slice 1)

## Context

Part of **issue #393** ("불필요한 context pruning"): scattered, non-MECE docs confuse both
humans and agents; converge into cohesive, human-readable SSOT + ADRs. This is the **first
work-unit slice** — the *version-control* domain. Later #393 slices (api convention single
doc; ml↔ml/backend/frontend boundary docs) are out of scope here.

## Mental model (user)

worktree-workflow / commit / github-label / PR are all facets of **one domain: version
control**. They must stay MECE (no overlap) but feel like *one cohesive thing* with a
single entry point. **AGENTS.md stays the global router** (links only, no duplicated rule
body).

## Findings (from full inventory, agent run a5d3e9f6)

The SSOT layering (rule → ADR-why → enforcement → routing) is already healthy. Real issues:

- **F1 (gap, ex-D10):** merge discipline / CI-gate rule ("local pre-push is the real gate;
  never merge on pending/red CI") lives ONLY in `AGENTS.md`, not in any rule SSOT — breaks
  the "AGENTS.md routes only" principle.
- **F2 (entry fragmentation):** the version-control domain is reachable only via 3 separate
  AGENTS.md links (worktree / label / PR). No single domain entry point.
- **F3 (missing SSOT):** commit-message convention has no doc anywhere (only implicit via
  conventional-commit branch types).
- **F4 (drift, ex-D1):** `pr-check.yml` branch regex requires slug to start `[a-z0-9]`;
  `worktree-workflow.md` omits this constraint.
- **F5 (lane-pool):** single-human multi-agent lane-pool mode is undocumented (draft already
  written on this branch).
- **F6 (minor):** `worktree-workflow.md` Files table is non-exhaustive (ex-D8); verify
  ADR-008 PreToolUse matcher reads `Edit|Write|NotebookEdit` (ex-D9).

## Requirements

- R1: Version-control domain has a **single entry point**; AGENTS.md routes to it (no rule
  body in AGENTS.md).
- R2: Facets stay **MECE**: Branch&Worktree / Issue-labeling / PR-Review-Merge / Commit —
  each with exactly one rule SSOT and (where it exists) one why-ADR.
- R3: Move the orphaned merge-discipline/CI-gate rule body out of AGENTS.md into its proper
  PR rule SSOT (F1).
- R4: Land lane-pool mode in `worktree-workflow.md` + ADR-008 changelog (F5).
- R5: Resolve commit-convention gap (F3) — add a short SSOT or explicitly fold into an
  existing facet (decision pending).
- R6: Fix drifts F4/F6.
- R7: Verify with craft-skills `/skill:documents` (convention + MECE compliance) before PR.

## Out of scope

- #393 api-convention single doc and ml/backend/frontend boundary docs (separate slices).
- Any change to enforcement script behavior (docs/routing only).
