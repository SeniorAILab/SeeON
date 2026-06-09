---
name: worktree-workflow
description: Create, manage, and tear down issue-driven git worktrees via `git wt`. Use when starting work on a GitHub issue, listing active worktrees, or removing a worktree after merging. Prevents direct work on protected branches.
---

# Worktree Workflow

This project enforces issue-driven worktrees. Every task starts from a GitHub Issue.
Do **not** hand-roll `git worktree add` or branch directly from `main`.

Full convention: `docs/rules/worktree-workflow.md`.

## Start work on an issue

```bash
git wt <issue#>          # reads issue title + label, creates branch + worktree
```

Example: `git wt 17` creates branch `feat/17-fall-webhook` and a worktree at
`<WORKTREE_ROOT>/feat/17-fall-webhook`, then prints the path.

Override the type label if needed:

```bash
git wt 17 --type fix
```

## List worktrees

```bash
git wt ls
```

## Remove a worktree (after merging)

```bash
git wt rm <issue#>       # or: git wt rm <branch>
```

**Never** use `rm -rf` on a worktree directory — manual deletion leaves phantom
`.git/worktrees/` entries that block `git branch -d`. `git wt rm` calls
`git worktree remove` + `git worktree prune` automatically.

## Setup (first time after clone)

```bash
sh scripts/git-guard/setup-hooks.sh
```

Registers the `git wt` alias and activates `.githooks/` enforcement.
The Codex hook trust prompt on first run is expected — approve it.
