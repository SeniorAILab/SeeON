---
slug: retire-git-wt-for-lane-pool
artifact: spec
status: done
issue: 407
author: gobeumsu (+ Claude Opus 4.8)
date: 2026-06-27
---

# Spec — Retire `git wt`, make lane-pool the single worktree mode

## What

Remove the `git wt` issue→worktree automation tool from the repository and
re-converge the worktree/branch convention onto a **single mode**: a persistent
**lane pool** (pre-created worktrees parked on idle `lane/N` refs, opened side by
side in tmux) inside which each task cuts a feature branch with plain git.

This is a deliberate reversal of the `git wt`-centric mechanism recorded in
**ADR-008**. The enforcement *philosophy* survives; only the heavy per-issue
automation and its ~30 doc cross-references are removed.

## Why (problem statement)

- **Over-coupling.** `git wt` / `wt.sh` is referenced from ~27 editable canonical
  files (ADR-008, ADR-040, ADR-015, AGENTS.md, README, scripts/AGENTS.md, six
  `docs/rules/*`, `docs/architecture.md`, `docs/decisions/README.md`, the three
  `.agents`/`.codex` skill mirrors, three `.github/*`, plus `assert-not-main.sh`'s
  error message). A single dev tool threaded through that many canonical docs is
  a maintenance smell and a drift magnet.
- **Dead in practice.** The team now works the lane-pool way: tmux holds
  `lane-1/2/3` (local) and `lane-1/2` (remote m1-pro) as long-lived, ML-resource-
  wired worktrees; work happens on a feature branch created *inside* a lane with
  `git switch -c`. `git wt` (which creates a fresh per-issue worktree and
  symlinks resources on the fly) is no longer the path anyone takes.
- **The real invariant is small.** The only thing that genuinely must be
  *enforced* is **"never commit/PR on `main`"** — already covered by
  `assert-not-main.sh` (local pre-commit/pre-push) and the CI head≠main check.
  Branch naming `<type>/<issue#>-<slug>` stays a *soft traceability convention*,
  not a tool-generated, gated artifact.

## Scope

### In scope
- Delete `scripts/git-guard/wt.sh`.
- Remove the `git wt` alias registration (and `wt.sh` chmod line) from
  `scripts/git-guard/setup-hooks.sh` — **keep** `core.hooksPath`, chmod of the
  surviving guard scripts, and the confirmation summary (reworded).
- Update `scripts/git-guard/assert-not-main.sh` error message that tells the
  user to run `git wt <issue#>` → lane-pool branch instruction.
- Edit **ADR-008** in place: reframe the decision from "git wt one front door"
  to "persistent lane pool + manual `git switch -c`; enforced invariant reduced
  to no-work-on-`main`". Add one `## Changelog` line. Keep the single-source-of-
  truth and git-native-enforcement pillars (they still describe the surviving
  guard scripts/hooks).
- Touch **ADR-040 / ADR-015** wording where they name `git wt`; sanity-check
  **ADR-016**. Add a Changelog line only where the body text actually changes.
- Update **`docs/rules/worktree-workflow.md`** to a single lane-pool flow.
- Sweep routing/reference docs that *instruct or mention* `git wt`:
  AGENTS.md, README.md, scripts/AGENTS.md, docs/architecture.md,
  docs/decisions/README.md, `docs/rules/{pr-decomposition-and-review,
  github-labels,ml-models,ml-filesystem-layout,README}.md`, and the skill mirrors
  `.agents/skills/{worktree-workflow,git-workflow-and-versioning,m1-pro-lab}` plus
  the `.codex/skills/worktree-workflow` mirror.
- Update `.github` surfaces (wording only): `pr-check.yml`,
  `issue-auto-label.yml`, `.github/ISSUE_TEMPLATE/task.yml`.

### Out of scope / explicitly preserved
- **All other git-guard scripts stay**: `lib.sh`, `assert-not-main.sh` (logic),
  `check-freshness.sh`, `sync-main.sh`, `check-migrations.sh`, `setup-hooks.sh`
  (minus alias), `.githooks/pre-commit`, `.githooks/pre-push`.
- **`type:` label taxonomy + auto-label workflow** (ADR-040) stay.
- **Lane-pool resource wiring rule** owned by `ml-models.md` /
  `ml-filesystem-layout.md` — fix only the `git wt auto-symlink` framing.
- **`docs/exec-plan/archive/**`** and **finalized active plan/spec bodies** —
  immutable history, never edited (only this slug's own files are authored).
- **Never delete any lane worktree** (incl. the stray `lane-1-3c019890`).

## Acceptance criteria

- [ ] `scripts/git-guard/wt.sh` no longer exists.
- [ ] `git config alias.wt` is not set by `setup-hooks.sh`; running it still sets
      `core.hooksPath=.githooks` and chmods the surviving scripts.
- [ ] No live `git wt`/`wt.sh` instruction on editable canonical surfaces
      (archived/historical exec-plans excluded by design).
- [ ] ADR-008 reads as a self-complete current decision describing the lane-pool
      mode + no-main invariant, with exactly one new `## Changelog` line.
- [ ] `docs/rules/worktree-workflow.md` describes one mode (lane-pool) with no
      `git wt` commands; the no-`main` rule, freshness, escape hatch remain.
- [ ] `assert-not-main` still rejects a commit/push on `main`.
- [ ] AGENTS.md Development Flow no longer shows `git wt <issue#>` as step 3.
- [ ] `pnpm typecheck`/lint unaffected; CI `ci-gate` green before merge.
