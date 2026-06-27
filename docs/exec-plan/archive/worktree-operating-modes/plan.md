---
slug: worktree-operating-modes
status: done
author: gobeumsu
date: 2026-06-27
issue: 402
---

# Worktree operating modes — plan

## Approach

Single docs-only edit to `docs/rules/worktree-workflow.md`. Add one `## Operating modes`
section between `## Branch naming` and `## Listing worktrees` (mode selection is conceptually
adjacent to branch/worktree creation). Delegate resource-symlink detail by cross-reference;
keep machine-specific tooling out.

## Steps

1. Edit `docs/rules/worktree-workflow.md`: insert `## Operating modes` with two subsections.
   - **Per-task mode (default)** — the existing `git wt` flow, named explicitly; note the
     auto-symlink behavior (`ml/models` linked; `ml/data` skipped when tracked `eval` exists).
   - **Lane-pool mode (single-human, multi-agent)** — persistent `lane-1..N` on `lane/N`,
     `git fetch origin && git reset --hard origin/main` per task, PR from `lane/N`, reuse.
     State the raw-`git worktree add` resource-wiring gap + cross-ref `ml-models.md` /
     `ml-filesystem-layout.md`; note deps warmed once per lane; note entry tooling is
     out-of-scope (dotfiles / project skill).
2. Verify hub consistency: `version-control.md`'s "per-task vs. lane-pool lifecycle" claim is
   now backed by the rule body (no edit needed there if wording already matches).
3. `pnpm lint` (docs-touching repo lint) + manual link check for the cross-refs.

## Files

- `docs/rules/worktree-workflow.md` (edit — add section)
- `docs/exec-plan/active/worktree-operating-modes/{spec,plan}.md` (this plan)

## Verification

- Section present and MECE with ADR-008 (no rationale duplication; ADR-008 still owns *why*).
- Cross-ref targets exist: `docs/rules/ml-models.md`, `docs/rules/ml-filesystem-layout.md`.
- No symlink-rule text duplicated from `ml-models.md`.
- `pnpm lint` clean.

## Distill check

No ADR. Both modes are operational lifecycle, not expensive-to-reverse decisions; ADR-008
already records the issue-driven-worktree decision. Archive this folder to
`docs/exec-plan/archive/` once the PR merges.
