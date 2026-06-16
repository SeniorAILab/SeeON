# Worktree Workflow

> Standing convention. See [ADR-008](../decisions/common/ADR-008-issue-driven-worktree-enforcement.md)
> for the cross-cutting rationale. Enforcement is
> automatic via `scripts/git-guard/` and `.githooks/` after running
> `scripts/git-guard/setup-hooks.sh`.

## Rule

**Never work directly on a protected branch (`main`).** Every task maps to a GitHub Issue,
which maps to a branch, which maps to a worktree.

```
GitHub Issue  →  branch <type>/<issue#>-<slice-slug>  →  worktree at $WORKTREE_ROOT/<branch>
```

## Creating a worktree

```bash
git wt <issue#>          # e.g. git wt 17
```

`git wt` (alias registered by `setup-hooks.sh`) reads the issue's `type:` label and title via
`gh`, derives the branch name, fetches `origin/main`, and creates the worktree outside the repo
root so `git status` stays clean. The worktree path is printed on success.

Override the type if the label is missing or wrong:

```bash
git wt 17 --type fix

# Fan-out slice for the same issue
git wt 17 --slug webhook-contract
```

## Branch naming

```
<type>/<issue#>-<slug>
```

- `<type>`: from the issue's `type: feat|fix|chore|docs|refactor|test` label; falls back to `feat`
- `<issue#>`: the GitHub issue number
- `<slug>`: issue title lowercased, non-alnum → `-`, capped at 50 chars for a 1-PR issue; for fan-out work, replace it with a slice-specific slug while keeping the same issue number

Examples: `feat/17-fall-webhook`, `fix/23-rtsp-timeout`, `chore/31-update-deps`

Fan-out note: when one issue must be split into multiple PRs, keep one branch and one
worktree per PR, keep the same issue number, and use a distinct slice slug via
`git wt <issue#> --slug <slice-slug>`. Record the slice boundary in the PR body.

## Listing worktrees

```bash
git wt ls
```

## Tearing down a worktree

```bash
git wt rm <issue#>       # or: git wt rm <branch>
```

Use `git wt rm`, **never** `rm -rf`. Manual deletion leaves phantom `.git/worktrees/` entries
that block `git branch -d` and `git checkout` until `git worktree prune` is run manually.
`git wt rm` calls `git worktree remove` + `git worktree prune` automatically.

After merging your PR, delete the local branch:

```bash
git branch -d <branch>
```

## Freshness

- **pre-push** blocks the push if the branch is behind `origin` (exit 1).
- **pre-commit** and **session start** warn if behind but do not block (exit 0).
- **session start** also fast-forwards local `main` to `origin/main` (ff-only, via `sync-main.sh`) so work always begins from fresh upstream `main`. It never forces, never rebases a feature branch, and is skipped when `main` is dirty or has diverged. From a feature worktree it refreshes `origin/main` and ff's the local `main` ref only when `main` is not checked out elsewhere (the main checkout self-syncs on its own session start).

To sync: `git pull --rebase`.

## Escape hatch — deliberate maintenance on main

For rare cases (bootstrap commits, hotfixes explicitly targeted at main):

```bash
GIT_GUARD_PROTECTED= git <cmd>
```

Setting `GIT_GUARD_PROTECTED` to empty disables enforcement for that invocation. This bypasses
only the guard scripts — document the reason in the commit message.

## Setup after clone

Run once per clone:

```bash
sh scripts/git-guard/setup-hooks.sh
```

This sets `core.hooksPath .githooks` and registers the `git wt` alias. Safe to re-run.
The hook trust prompt in Codex on first run is expected — approve it.

## Files

| File | Role |
|------|------|
| `scripts/git-guard/lib.sh` | Shared helpers (single source of truth for all layers) |
| `scripts/git-guard/assert-not-main.sh` | Exits 1 when HEAD is on a protected branch |
| `scripts/git-guard/check-freshness.sh` | Compares HEAD to upstream; block or warn mode |
| `scripts/git-guard/sync-main.sh` | Fast-forwards local default branch to `origin` (ff-only, safe); run at session start |
| `scripts/git-guard/wt.sh` | Issue → worktree creator and manager |
| `scripts/git-guard/setup-hooks.sh` | Post-clone setup (idempotent) |
| `.githooks/pre-commit` | git hook: assert-not-main + freshness warn |
| `.githooks/pre-push` | git hook: assert-not-main + freshness block |
| `.claude/settings.json` | Claude Code early-guidance hooks (SessionStart + PreToolUse) |
| `.codex/config.toml` `[hooks]` | Codex early-guidance hooks (shell pre_tool_use) |
