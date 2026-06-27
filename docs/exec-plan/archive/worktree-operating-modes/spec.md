---
slug: worktree-operating-modes
status: done
author: gobeumsu
date: 2026-06-27
issue: 402
---

# Worktree operating modes — spec

## Problem

`docs/rules/version-control.md` (the version-control hub) states that
`worktree-workflow.md` covers "per-task vs. lane-pool lifecycle", but the rule body
has no section describing the two modes. A reader following the hub link finds the
claim unfulfilled, and the lane-pool model a single human uses to drive several agents
in parallel is undocumented (its resource-wiring caveat in particular is tribal knowledge).

## Goal

Make `worktree-workflow.md` self-consistent with its hub by documenting the two
operating modes, with the lane-pool resource-wiring caveat stated once and the rest
delegated by cross-reference (no duplication of the symlink SSOT).

## Requirements

- Add an `## Operating modes` section to `docs/rules/worktree-workflow.md`:
  - **Per-task mode** (default): issue → `git wt` → fresh worktree → PR → tear down;
    `git wt` auto-symlinks gitignored ML resources (`ml/models`; `ml/data` skipped when
    the tracked `ml/data/eval` checkout already exists).
  - **Lane-pool mode** (single-human, multi-agent): persistent `lane-1..N` worktrees on
    long-lived `lane/N` branches, hard-reset to `origin/main` at task start, reused after PR.
- State the lane-pool caveat: a lane created with raw `git worktree add` does **not** get the
  `ml/models` / `ml/data` / `.env.local` wiring that `git wt` provides — wire it once per lane.
- Cross-reference the symlink SSOT (`docs/rules/ml-models.md`, `ml-filesystem-layout.md`)
  rather than restating it.

## Out of scope (explicit non-goals)

- Personal shell helpers (`eflab`/`eflocal`/`efl`/`efr`) and tmux session names
  (`ef-local`/`ef-remote`) — machine-specific, live in the operator's dotfiles, not in the rule.
- m1-pro remote access regime — owned by the planned project skill referenced in
  `docs/exec-plan/active/fall-autoresearch-loop/`.
- No new ADR: neither mode is an expensive-to-reverse decision; the *why* of issue-driven
  worktrees is already ADR-008.

## Acceptance

- `worktree-workflow.md` has an `## Operating modes` section covering both modes and the
  resource-wiring caveat, with cross-refs (no duplicated symlink rule text).
- The hub claim in `version-control.md` is now satisfied by the rule body.
- `pnpm lint` / docs links resolve; change is docs-only and minimal.
