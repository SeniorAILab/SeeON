---
name: worktree-workflow
description: Start, name, and finish issue-driven work inside a persistent lane-pool worktree. Use when starting work on a GitHub issue, listing worktrees, or returning a lane to idle after merging. The one hard rule is never commit/push on a protected branch (main).
---

# Worktree Workflow

This project uses a fixed pool of **persistent lane worktrees** (`lane-1/2/3`, …), reused
across issues and kept warm. Every task starts from a GitHub Issue and is cut onto its own
feature branch inside an idle lane. The one hard invariant: **never commit or push on a
protected branch (`main`)** — enforced by `assert-not-main.sh` (pre-commit/pre-push) and the
`pr-check.yml` head≠`main` check.

Do **not** create a fresh worktree per task. There is no issue→worktree automation tool.

Full convention: `docs/rules/worktree-workflow.md`.

## Start work on an issue

Pick an idle lane, fetch, and branch from fresh `origin/main`:

```bash
cd $WORKTREE_ROOT/lane-<n>
git fetch origin
git switch -c <type>/<issue#>-<slug> origin/main
```

You name the branch yourself: `<type>` is the issue's `type:` label
(feat/fix/chore/docs/refactor/test), `<slug>` is a short kebab slug of the title that must
start with `[a-z0-9]`. Example: `feat/17-fall-webhook`.

Branch naming is a **traceability convention, not a hard gate** — fix drift during review.

## List worktrees

```bash
git worktree list
```

## Finishing a task (after the PR merges)

Return the lane to idle and delete the merged feature branch — **keep the warm worktree;
never delete a lane**:

```bash
git switch lane/<n>                # park on the idle ref
git branch -D <type>/<issue#>-<slug>
```

**Never** `rm -rf` a worktree. If a lane must ever be removed, use `git worktree remove` +
`git worktree prune` so no phantom `.git/worktrees/` entry is left.

## Setup (first time after clone)

```bash
sh scripts/git-guard/setup-hooks.sh
```

Sets `core.hooksPath .githooks` and chmods the guard scripts, activating enforcement.
The Codex hook trust prompt on first run is expected — approve it.
