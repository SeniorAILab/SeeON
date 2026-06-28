# Worktree Workflow

> The branch & worktree facet of version control (hub: `docs/rules/version-control.md`).
> See [ADR-008](../decisions/common/ADR-008-issue-driven-worktree-enforcement.md) for the
> rationale. Enforcement is automatic via `scripts/git-guard/` and `.githooks/` after running
> `scripts/git-guard/setup-hooks.sh`.

## Rule

**Never commit or push on a protected branch (`main`).** This is the one hard invariant —
enforced locally by `assert-not-main.sh` (pre-commit/pre-push) and on the remote by the
`pr-check.yml` head≠`main` check. Every task maps to a GitHub Issue, which maps to a feature
branch, which is checked out inside a persistent **lane**.

```
GitHub Issue  →  branch <type>/<issue#>-<slug>  →  checked out inside an idle lane
```

## The lane pool

There is one worktree lifecycle: a **fixed pool of persistent lanes**, reused across issues.
Creating and destroying a worktree per task is wasteful — every new worktree re-runs
`pnpm install` / `uv sync` (cold deps) and abandoned worktrees accumulate. Concurrent agents
cannot share one working directory, so keep N long-lived lanes (one per agent you run at once)
warm and switch branches inside them.

### Layout

```
eldercare-fall-ai/                 # main worktree = orchestration home
                                   #   never edit here; keep clean as the branch base
$WORKTREE_ROOT/lane-1/             # agent lane 1 (persistent)   $WORKTREE_ROOT = sibling
$WORKTREE_ROOT/lane-2/             # agent lane 2 (persistent)   dir next to the repo, e.g.
$WORKTREE_ROOT/lane-3/             # agent lane 3 (persistent)   ../eldercare-fall-ai.…-worktrees/
```

- Pool size **N = the max number of agents you run at once** (typically 2–4).
- Each lane is created once and **never torn down per task** — its `node_modules` / `.venv`
  stay warm:
  ```bash
  git worktree add -b lane/<n> $WORKTREE_ROOT/lane-<n> origin/main
  ```
- **Resources must be wired once per lane.** A plain `git worktree add` does not populate the
  gitignored ML payload. Symlink `ml/models` and the ignored `ml/data/{le2i,nursing-home,uploads}`
  subdirs to the main checkout (`ml/data/eval` stays a tracked checkout), and link `.env.local`.
  The symlink rule is owned by [`ml-models.md`](./ml-models.md) /
  [`ml-filesystem-layout.md`](./ml-filesystem-layout.md) — follow it, do not restate it.
- The persistent `lane/<n>` branch is just an **idle parking ref** — real work always happens
  on a per-issue feature branch checked out inside the lane.

> tmux convenience wrappers for opening the local/remote lane pool side by side are
> machine-specific (shell dotfiles), not a repo concern.

## Starting a task in a free lane

Always branch from **fresh `origin/main`** — this is the "pull before work" step:

```bash
cd $WORKTREE_ROOT/lane-<n>
git fetch origin
git switch -c <type>/<issue#>-<slug> origin/main
```

No issue→branch automation tool is involved — you name the branch yourself from the issue's
`type:` label and a short slug (see [Branch naming](#branch-naming)).

## Branch naming

```
<type>/<issue#>-<slug>
```

- `<type>`: the issue's `type: feat|fix|chore|docs|refactor|test` label (auto-applied by
  `issue-auto-label.yml`; see [`github-labels.md`](./github-labels.md))
- `<issue#>`: the GitHub issue number
- `<slug>`: issue title lowercased, non-alnum → `-`, **must start with `[a-z0-9]`** (the
  `pr-check.yml` branch regex enforces this), capped at ~50 chars; for fan-out work, use a
  distinct slice-specific slug while keeping the same issue number

Examples: `feat/17-fall-webhook`, `fix/23-rtsp-timeout`, `chore/31-update-deps`

Branch naming is a **traceability convention, not a CI hard gate**. The hard boundary is that
work must not happen directly on a protected branch (`main`), and PRs must target an allowed
base branch. CI rejects same-repo PRs whose head branch is `main`, matching the local
protected-branch guard. A misnamed non-protected head branch is reversible — fix naming drift
during review or periodic audit instead of blocking the PR for its head branch name alone.

Fan-out note: when one issue must be split into multiple PRs, use one lane + one feature branch
per PR, keep the same issue number, and give each a distinct slice slug. Record the slice
boundary in the PR body.

## Finishing a task

After the PR merges, return the lane to idle and delete the merged feature branch — **keep the
warm worktree; never delete a lane**:

```bash
git switch lane/<n>                # park on the idle ref
git branch -D <type>/<issue#>-<slug>
```

The next task reuses the same lane via the start command above. Never `rm -rf` a worktree;
if a lane ever must be removed, use `git worktree remove` + `git worktree prune` so no phantom
`.git/worktrees/` entry is left behind.

## Listing worktrees

```bash
git worktree list
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

This sets `core.hooksPath .githooks` and chmods the guard scripts. Safe to re-run.
The hook trust prompt in Codex on first run is expected — approve it.

## Canonical remote

The canonical repository is `SeniorAILab/eldercare-fall-ai`. An older
`GoBeromsu/eldercare-fall-ai` origin still resolves through GitHub's move
redirect — pushes succeed, but PRs must be opened against `SeniorAILab`
(`gh pr create --repo SeniorAILab/eldercare-fall-ai`). Re-point a redirecting
clone so tooling targets the canonical repo directly:

```bash
git remote set-url origin https://github.com/SeniorAILab/eldercare-fall-ai.git
```

## Files

| File | Role |
|------|------|
| `scripts/git-guard/lib.sh` | Shared helpers (single source of truth for all layers) |
| `scripts/git-guard/assert-not-main.sh` | Exits 1 when HEAD is on a protected branch |
| `scripts/git-guard/check-freshness.sh` | Compares HEAD to upstream; block or warn mode |
| `scripts/git-guard/check-lint.sh` | Lint + typecheck on changed packages at pre-push (mirrors `ci.yml`); `GIT_GUARD_SKIP_LINT=1` bypass |
| `scripts/git-guard/deny-assets.sh` | Blocks committing large/binary asset classes (irreversible-leak gate, ADR-016) |
| `scripts/git-guard/sync-main.sh` | Fast-forwards local default branch to `origin` (ff-only, safe); run at session start |
| `scripts/git-guard/check-migrations.sh` | Rejects out-of-order Prisma migrations (new ts ≤ latest on base); run in backend CI |
| `scripts/git-guard/setup-hooks.sh` | Post-clone setup (idempotent) |
| `.githooks/pre-commit` | git hook: assert-not-main + freshness warn |
| `.githooks/pre-push` | git hook: assert-not-main + freshness block |
| `.claude/settings.json` | Claude Code early-guidance hooks (SessionStart + PreToolUse) |
| `.codex/config.toml` `[hooks]` | Codex early-guidance hooks (shell pre_tool_use) |
