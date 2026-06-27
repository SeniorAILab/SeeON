# Worktree Workflow

> The branch & worktree facet of version control (hub: `docs/rules/version-control.md`).
> See [ADR-008](../decisions/common/ADR-008-issue-driven-worktree-enforcement.md) for the
> rationale. Enforcement is automatic via `scripts/git-guard/` and `.githooks/` after running
> `scripts/git-guard/setup-hooks.sh`.

## Rule

**Never work directly on a protected branch (`main`).** Every task maps to a GitHub Issue,
which maps to a branch, which maps to a worktree.

```
GitHub Issue  →  branch <type>/<issue#>-<slice-slug>  →  worktree at $WORKTREE_ROOT/<branch>
```

## Operating modes

Two sanctioned worktree lifecycles. Both honor the same invariant — **never commit or push
on a protected branch**, every task starts from fresh `origin/main`, branch naming is
`<type>/<issue#>-<slug>`. They differ only in worktree *lifespan*.

| Mode | When | Worktree lifespan |
|------|------|-------------------|
| **A. Per-task** (default) | Occasional / sequential work; CI agents | One worktree per issue via `git wt`, torn down with `git wt rm` after merge |
| **B. Lane pool** | Single human orchestrating **concurrent** agents | A fixed set of persistent `lane-N` worktrees, reused across issues |

Mode A is the documented default below. Mode B is described in [Lane-pool mode](#lane-pool-mode-single-human-multi-agent).

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
- `<slug>`: issue title lowercased, non-alnum → `-`, **must start with `[a-z0-9]`** (the `pr-check.yml` branch regex and `wt.sh` slugify both enforce this), capped at 50 chars for a 1-PR issue; for fan-out work, replace it with a slice-specific slug while keeping the same issue number

Examples: `feat/17-fall-webhook`, `fix/23-rtsp-timeout`, `chore/31-update-deps`

Branch naming is a traceability convention, not a CI hard gate. The hard boundary is
that work must not happen directly on a protected branch (`main`), and PRs must target
an allowed base branch. CI also rejects same-repo PRs whose head branch is `main`,
matching the local protected-branch guard. A misnamed non-protected head branch is
reversible: prefer creating branches through `git wt`, and fix naming drift during
review or periodic audit instead of blocking the PR only for its head branch name.

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

## Lane-pool mode (single-human multi-agent)

For a single human driving **multiple concurrent agents**, creating and destroying a
worktree per task is wasteful: every new worktree re-runs `pnpm install` / `uv sync` (cold
deps) and abandoned worktrees accumulate. Concurrent agents still cannot share one working
directory, so keep a **fixed pool of persistent lanes** and reuse them.

### Layout

```
eldercare-fall-ai/                 # main worktree = orchestration home
                                   #   never edit here; keep clean as the branch base
$WORKTREE_ROOT/lane-1/             # agent lane 1 (persistent)
$WORKTREE_ROOT/lane-2/             # agent lane 2 (persistent)
$WORKTREE_ROOT/lane-3/             # agent lane 3 (persistent)
```

- Pool size **N = the max number of agents you run at once** (typically 2–4).
- Each lane is created once (`git worktree add -b lane/<n> $WORKTREE_ROOT/lane-<n> origin/main`)
  and **never torn down per task** — its `node_modules` / `.venv` stay warm.
- The persistent `lane/<n>` branch is just an idle parking ref; real work happens on a
  per-issue feature branch checked out inside the lane.

### Starting a task in a free lane

Always branch from **fresh `origin/main`** — this is the "pull before work" step:

```bash
cd $WORKTREE_ROOT/lane-<n>
git fetch origin
git switch -c <type>/<issue#>-<slug> origin/main
```

### Finishing a task

After the PR merges, return the lane to idle and delete the merged feature branch — keep
the warm worktree:

```bash
git switch lane/<n>                # park on the idle ref
git branch -D <type>/<issue#>-<slug>
```

The next task reuses the same lane via the start command above.

### Rules

- Do **not** `git wt` / `git wt rm` per task in this mode — that reintroduces the churn the
  pool exists to avoid. Cap the lane count; do not let worktrees pile up.
- One branch cannot be checked out in two worktrees at once — each lane is on a distinct
  branch, so this holds naturally.
- All enforcement and freshness gates below still apply unchanged.

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
| `scripts/git-guard/check-lint.sh` | Lint + typecheck on changed packages at pre-push (mirrors `ci.yml`); `GIT_GUARD_SKIP_LINT=1` bypass |
| `scripts/git-guard/deny-assets.sh` | Blocks committing large/binary asset classes (irreversible-leak gate, ADR-016) |
| `scripts/git-guard/sync-main.sh` | Fast-forwards local default branch to `origin` (ff-only, safe); run at session start |
| `scripts/git-guard/check-migrations.sh` | Rejects out-of-order Prisma migrations (new ts ≤ latest on base); run in backend CI |
| `scripts/git-guard/wt.sh` | Issue → worktree creator and manager |
| `scripts/git-guard/setup-hooks.sh` | Post-clone setup (idempotent) |
| `.githooks/pre-commit` | git hook: assert-not-main + freshness warn |
| `.githooks/pre-push` | git hook: assert-not-main + freshness block |
| `.claude/settings.json` | Claude Code early-guidance hooks (SessionStart + PreToolUse) |
| `.codex/config.toml` `[hooks]` | Codex early-guidance hooks (shell pre_tool_use) |
