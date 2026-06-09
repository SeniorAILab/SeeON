---
slug: issue-driven-worktree-workflow
status: active
date: 2026-06-09
author: gobeumsu (via Claude Opus 4.8)
---

# Spec — Issue-Driven Worktree Workflow + System-Level Enforcement

## Problem

The project is heading to production with a multi-stack monorepo (Python ML
training/inference, frontend dashboard, backend API, KakaoTalk webhooks) worked on
by multiple agents (Claude Code, Codex) and a human. Today there is **no mechanism**
that:

1. turns a GitHub Issue into an isolated working environment (branch + worktree) with a
   consistent name, and
2. prevents work from happening directly on `main` or from starting on a stale tree.

Deep research (2026-06-09, run `wf_eb2eff77-150`) confirmed the constraint that shapes
this work: **no existing tool maps a GitHub Issue → branch → worktree** (the three
surviving tools — Claude Code native, despreston/gh-worktree, eikster-dk/gh-worktree —
cover *pull requests* only; `agenttools/worktree`'s issue support was refuted 0-3).
Issue→worktree must therefore be **scripted in-repo**.

Research also established the enforcement architecture:

- `git worktree prune` is the sufficient, native stale-worktree cleanup (no third-party
  tool). **Removing a worktree with `rm -rf` instead of `git worktree remove` leaves
  phantom `.git/worktrees/` entries that actively block branch checkout and
  `git branch -d` until pruned** — so teardown discipline must be scripted, not manual.
- GitHub's native "Automatically delete head branches" handles merged-PR cleanup;
  `fpicalausa/remove-stale-branches` handles time-based stale cleanup. (These are the
  *remote* cleanup layer, configured separately — see Out of Scope.)

## Decisions (settled via interview, 2026-06-09)

| # | Question | Decision |
|---|----------|----------|
| D1 | Branch naming for issue-based work | **`<type>/<issue#>-<slug>`** (e.g. `feat/17-fall-webhook`, `fix/23-rtsp-timeout`). `<type>` auto-maps from the issue's label; `<slug>` derives from the issue title. Keeps the existing `git-workflow-and-versioning` type-prefix convention **and** encodes the issue link. |
| D2 | Where is the "don't work on main" rule recorded vs enforced | **Rule (intent)** → `docs/rules/worktree-workflow.md` (human + agent readable). **Enforcement (teeth)** → git-native hook script. Documentation and enforcement are separate artifacts. |
| D3 | Primary enforcement mechanism | **git-native hooks** via `core.hooksPath` → committed `.githooks/`. System-level: applies to every actor (Claude, Codex, human) at `git commit`/`git push`, with no agent-specific bypass. |
| D4 | Freshness ("did you pull latest?") strictness | **Block on push**, **warn on commit/session**. `pre-push` refuses when the branch is behind `origin`; commit-time and session-start only warn, so offline / intentional historical work is not blocked. |
| D5 | Agent-level hooks | **Secondary, early-guidance only.** Claude Code (`settings.json` PreToolUse) and Codex (`hooks.json`) warn *before* edits on `main` to save round-trips — they are not the enforcement line. |
| D6 | Single source of truth for hook logic | **All layers call the same shell scripts** under `scripts/git-guard/`. `.githooks/`, Claude hooks, and Codex hooks are thin invokers — zero duplicated logic, so behavior is **identical across agents** by construction. |
| D7 | Issue → worktree entry point | A scripted `scripts/git-guard/wt.sh` (human-invocable, e.g. `bin/wt`) wrapped by a worktree skill mirrored across `.claude/.agents/.codex` skill dirs (agent-invocable). One implementation, two front doors. |

## Requirements

### R1 — Issue template
`.github/ISSUE_TEMPLATE/` carries a structured task template (title, type label, summary,
acceptance criteria). The type label is the source for `<type>` in the branch name.

### R2 — Issue → worktree creator (`wt.sh`)
Given an issue number: `gh issue view <N> --json title,labels` → derive `<type>` (from
label) and `<slug>` (slugified title) → create branch `<type>/<issue#>-<slug>` → create a
worktree at a consistent path (`$WORKTREE_ROOT/<repo>/<branch>` convention) → print the path.
Teardown subcommand uses `git worktree remove` (never `rm -rf`) + `git worktree prune`.

### R3 — `assert-not-main.sh`
Exits non-zero when the current branch is a protected branch (`main`, configurable list),
with an actionable message pointing at `wt.sh`.

### R4 — `check-freshness.sh <block|warn>`
`git fetch` then compare HEAD to its upstream. `block` mode → exit non-zero when behind;
`warn` mode → print a warning and exit 0.

### R5 — git hooks (enforcement)
`.githooks/pre-commit` → `assert-not-main` + `check-freshness warn`.
`.githooks/pre-push` → `assert-not-main` + `check-freshness block`.
A `scripts/setup-hooks.sh` sets `core.hooksPath .githooks` (one-time post-clone).

### R6 — agent early-guidance hooks (UX)
Claude `settings.json`: SessionStart → `check-freshness warn`; PreToolUse(Edit|Write) →
`assert-not-main`. Codex `hooks.json`: PreToolUse(shell) → `assert-not-main`. Both invoke
the **same** `scripts/git-guard/*` scripts (D6). Codex's documented limitation (hooks see
shell commands only, not file edits) is acceptable because the git-native layer (R5)
catches the commit regardless.

### R7 — rule doc
`docs/rules/worktree-workflow.md` states the convention: never work on `main`; one issue →
one branch → one worktree; teardown via the script; naming per D1.

## Out of Scope (this work item)

- **Remote branch cleanup** (GitHub "auto-delete head branches", `remove-stale-branches`
  Action) — separate, settings/CI-level, tracked elsewhere.
- **CI merge gates, release automation** (release-please / semantic-release), monorepo
  path-filtered pipelines, ML artifact/DVC lifecycle — the broader production roadmap;
  this item is the local worktree+branch-hygiene foundation only.
- Husky / Node-coupled hook delivery — rejected in favor of tool-agnostic `core.hooksPath`
  so Python/ML contributors are not forced through `pnpm install`.

## Acceptance criteria

1. `bin/wt 17` on a clean tree creates branch `feat/17-<slug>` and a worktree, and prints its path.
2. `git commit` on `main` is refused by the git hook with a message naming `wt.sh`.
3. `git push` while behind `origin` is refused; `git commit` while behind only warns.
4. Claude and Codex both surface the same warning text on `main` (proves shared-script reuse).
5. The rule is readable in `docs/rules/worktree-workflow.md` and referenced from AGENTS.md.
6. Tearing down a worktree via the script leaves no phantom entry (`git worktree list` clean,
   `git branch -d` of the merged branch succeeds without a prune step).

## Distill candidate

The choice of **worktree-per-issue + git-native `core.hooksPath` enforcement** (over
agent-only hooks or husky) is cross-cutting and expensive to reverse → distill into an ADR
when this plan is archived (alongside the `docs/rules/` convention, mirroring how
ml-asset-layout produced ADR-007).
