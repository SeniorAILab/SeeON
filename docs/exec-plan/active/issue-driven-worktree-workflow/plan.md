---
slug: issue-driven-worktree-workflow
status: active
date: 2026-06-09
author: gobeumsu (via Claude Opus 4.8)
spec: ./spec.md
---

# Plan — Issue-Driven Worktree Workflow + System-Level Enforcement

> **Pending approval.** Read-only until explicit "execute". Atomic commits on a feature
> branch → PR → merge. NOTE: this very work item should itself be done on a worktree off a
> `feat/<issue#>-…` branch once the issue exists — bootstrap exemption applies only to the
> first commit that introduces the hooks.

## Code grounding (verified 2026-06-09)

- No `.github/` directory exists yet → issue template is greenfield.
- No `.claude/settings.json` / `.claude/settings.local.json` → Claude hooks greenfield.
- `.codex/config.toml` exists (model config only, no `[hooks]`) → Codex hooks greenfield.
- Skill unit = a single `SKILL.md` (frontmatter `name`/`description`) under
  `.claude/skills/<name>/`. Mirrors: `.agents/skills/`, `.codex/skills/`.
  ⚠️ AGENTS.md claims `.codex/skills` is a symlink to `.agents/skills`; on disk it is a
  **plain directory** (drift). Out of scope to fix here, but the new skill must be written
  to all three trees, not assumed-symlinked.
- `gh` 2.93.0 present; remote `origin = github.com/GoBeromsu/eldercare-fall-ai`.
- `.gitignore` already ignores worktree-adjacent scratch (`.omc/.omo/.omx`); confirm it
  covers the chosen `$WORKTREE_ROOT` if it lands inside the repo (default: sibling dir, so
  no ignore needed).
- Existing `git-workflow-and-versioning` skill documents `feat/<desc>` naming and a manual
  `git worktree add` snippet (lines 121-165) → this work supersedes that snippet with the
  scripted `<type>/<issue#>-<slug>` flow; update that section in Commit 5.

## Commit 1 — Shared guard scripts (single source of truth)  `feat`

The logic every layer reuses (spec D6). Pure POSIX sh, no Node/Python dependency.

1. `scripts/git-guard/lib.sh` — shared helpers: `current_branch()`, `protected_branches()`
   (default `main`; overridable via `GIT_GUARD_PROTECTED` env), colored `warn`/`die`.
2. `scripts/git-guard/assert-not-main.sh` — exit 1 if `current_branch` ∈ protected, message:
   *"You are on <branch>. Don't work on a protected branch — run `bin/wt <issue#>` to get an
   isolated worktree. See docs/rules/worktree-workflow.md."*
3. `scripts/git-guard/check-freshness.sh <block|warn>` — `git fetch --quiet`; compare
   `@{upstream}` via `git rev-list --left-right --count`; if behind: `block`→die, `warn`→warn.
   No upstream set → warn-and-pass (new branch case).
4. **Verification:** run each script in a throwaway state (on `main` → assert fails; on a temp
   branch → passes; simulate behind by resetting a local clone → freshness block fails/warns).
   ShellCheck clean (`shellcheck scripts/git-guard/*.sh`).

## Commit 2 — `wt.sh` issue → worktree creator + `bin/wt`  `feat`

1. `scripts/git-guard/wt.sh`:
   - `wt <issue#>`: `gh issue view <N> --json title,labels` → `<type>` from first label
     matching `feat|fix|chore|refactor|docs|test` (fallback `feat`); `<slug>` = title
     lowercased, non-alnum→`-`, trimmed, length-capped. Branch = `<type>/<issue#>-<slug>`.
     `git worktree add -b <branch> "$WORKTREE_ROOT/<repo>/<branch>"` off `origin/main`
     (fetch first). Print resulting path. `WORKTREE_ROOT` default = repo parent dir.
   - `wt rm <issue#|branch>`: resolve worktree → `git worktree remove` (NOT `rm -rf`) →
     `git worktree prune`. Refuse if dirty unless `--force`.
   - `wt ls`: `git worktree list` passthrough.
   - Guard: refuse to create if branch already exists (point to existing worktree).
2. `bin/wt` — thin executable wrapper calling `scripts/git-guard/wt.sh` (human front door).
3. **Verification:** against a real disposable issue (or a mocked `gh` in a test harness):
   `bin/wt <N>` creates the expected branch+worktree; `bin/wt rm <N>` leaves
   `git worktree list` clean and `git branch -d` of the (merged) branch succeeds with no
   manual prune (proves acceptance criterion 6). ShellCheck clean.

## Commit 3 — git-native enforcement via `core.hooksPath`  `feat`

1. `.githooks/pre-commit` → `assert-not-main` + `check-freshness warn`.
2. `.githooks/pre-push` → `assert-not-main` + `check-freshness block`.
   (Both `exec` the Commit-1 scripts; zero inline logic.)
3. `scripts/setup-hooks.sh` → `git config core.hooksPath .githooks` + chmod +x the hook/guard
   files; idempotent; prints confirmation.
4. Run `scripts/setup-hooks.sh` in this repo as part of the commit's verification.
5. **Verification (acceptance 2 & 3):** on `main`, `git commit` is refused; on a feature
   branch behind origin, `git push` refused but `git commit` only warns. Capture the actual
   refusal output in the commit body / verifier evidence.

## Commit 4 — agent early-guidance hooks (Claude + Codex)  `feat`

Thin invokers of the same Commit-1 scripts (spec D5/D6).

1. `.claude/settings.json`:
   - `SessionStart` → `scripts/git-guard/check-freshness.sh warn`
   - `PreToolUse` matcher `Edit|Write|NotebookEdit` → `scripts/git-guard/assert-not-main.sh`
     (non-zero blocks the tool; message guides to `bin/wt`).
2. `.codex/` hooks: add inline `[hooks]` to `config.toml` (or `.codex/hooks.json`):
   `PreToolUse` (shell scope) → `assert-not-main.sh`. Document Codex's shell-only limitation
   inline (file edits are caught by the Commit-3 git hook, not here).
3. **Verification (acceptance 4):** trigger an edit attempt on `main` in a Claude session →
   blocked with the guide message; confirm the Codex hook definition is byte-identical in
   intent (same script path). Diff the warning text emitted by both → identical (proves
   shared-script reuse, not copies).

## Commit 5 — rule doc + issue template + supersede stale snippet  `docs`

1. `docs/rules/worktree-workflow.md` (spec R7): the convention — never work on a protected
   branch; one issue → one branch (`<type>/<issue#>-<slug>`) → one worktree; teardown via
   `bin/wt rm`; freshness expectations (push-blocking, commit-warning). Link the guard
   scripts and `setup-hooks.sh`.
2. `.github/ISSUE_TEMPLATE/task.yml` (spec R1): structured form — title, **type label**
   (drives `<type>`), summary, acceptance criteria. Optional `config.yml` to set
   `blank_issues_enabled`.
3. Worktree skill `SKILL.md` (spec D7) written to **all three** mirrors
   (`.claude/skills/worktree-workflow/`, `.agents/skills/`, `.codex/skills/`): instructs the
   agent to invoke `bin/wt <issue#>` rather than hand-rolling `git worktree add`.
4. Update `git-workflow-and-versioning/SKILL.md` (all three mirrors) "Working with Worktrees"
   section to point at `bin/wt` and the new rule, replacing the manual snippet.
5. Update root `AGENTS.md` "Way point" / conventions to reference
   `docs/rules/worktree-workflow.md` and `scripts/git-guard/`.
6. **Verification:** issue template renders on GitHub (push branch, open "New issue" preview);
   rule doc cross-links resolve; skill mirrors are content-identical (diff the three).

## Commit 6 — ADR distill (at archive)  `docs`

Per spec "Distill candidate" + AGENTS.md distill rule. Run **`/documentation-and-adrs`** to
author `docs/decisions/ADR-008-issue-driven-worktree-enforcement.md`: the cross-cutting
choice of worktree-per-issue + git-native `core.hooksPath` enforcement, with rejected
alternatives recorded (husky/Node-coupled delivery; agent-only hooks; remote-only / no local
enforcement). Then set both `spec.md` and `plan.md` frontmatter `status: done` and move the
folder `active/ → archive/`.

## Risks & fallbacks

- **`gh` label → type mapping ambiguity** (issue has multiple/no matching labels): deterministic
  precedence list + `feat` fallback; `wt` prints the chosen type so the user can override with
  `wt <N> --type fix`.
- **`WORKTREE_ROOT` collisions / path with spaces**: quote everywhere; ShellCheck enforced;
  default to repo-parent to avoid nesting a worktree inside the repo (which would dirty status).
- **Codex hook trust prompt**: Codex marks new/changed hooks for review before they run — the
  rule doc must tell contributors to trust the hook on first run; this is expected, not a bug.
- **Hook blocks legitimate `main` maintenance** (e.g., the bootstrap commit, or a hotfix the
  team explicitly wants on main): `GIT_GUARD_PROTECTED=""` env escape hatch, documented in the
  rule, for the rare deliberate case.

## Out of scope (restated)

Remote branch auto-delete + `remove-stale-branches` Action, CI merge gates, release
automation, ML/DVC lifecycle — tracked in the broader production roadmap, not here.
