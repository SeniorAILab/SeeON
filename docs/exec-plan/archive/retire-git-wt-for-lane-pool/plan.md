---
slug: retire-git-wt-for-lane-pool
artifact: plan
status: done
issue: 407
author: gobeumsu (+ Claude Opus 4.8)
date: 2026-06-27
---

# Plan — Retire `git wt`, lane-pool as the single worktree mode

> Spec: `spec.md` (same folder). Worktree: branch `refactor/407-retire-git-wt`
> created inside lane-1 off `origin/main`. Single reviewable PR.

## Design decision (the substantive part)

**Reframe, don't shrink, the enforcement model.**

| Concern | Before (`git wt` model) | After (lane-pool model) |
|---|---|---|
| Worktree creation | `git wt <issue#>` creates a fresh per-issue worktree + symlinks ML resources | Persistent lane pool (`lane-1/2/3` local, `lane-1/2` remote), pre-wired once; parked on idle `lane/N` |
| Branch creation | Tool-generated `<type>/<issue#>-<slug>` | Manual `git switch -c <type>/<issue#>-<slug> origin/main` inside an idle lane |
| Resource wiring | Per-worktree auto-symlink in `wt.sh` | Per-lane one-time symlink (owned by `ml-models.md` / `ml-filesystem-layout.md`) |
| Teardown | `git wt rm` | Branch merges; lane returns to idle `lane/N` (no teardown, never deleted) |
| **Hard-enforced invariant** | no-work-on-`main` + the tool | **no-work-on-`main` only** — `assert-not-main` (pre-commit/pre-push) + CI head≠main |
| Branch naming | tool-enforced | **soft traceability convention** (fixed during review, not gated) |
| Single-source enforcement | `scripts/git-guard/` | `scripts/git-guard/` (unchanged, minus `wt.sh`) |

**What stays = the actual guarantees:** `assert-not-main.sh`, `check-freshness.sh`,
`sync-main.sh`, `check-migrations.sh`, `lib.sh`, `core.hooksPath`, both git hooks.
**What goes = the ceremony:** `wt.sh` + its references.

## Execution steps

### Step 0 — done
- Issue #407 (`type: refactor`); branch `refactor/407-retire-git-wt` in lane-1
  off origin/main; this spec+plan committed (plan-first finalize).

### Step 1 — Tooling removal
- `git rm scripts/git-guard/wt.sh`.
- Edit `setup-hooks.sh`: remove alias header comment (line 4), the alias block
  (16–17), the `wt.sh` chmod entry (27), the `alias.wt` printf (33); reword the
  completion message (38). Keep core.hooksPath + all other chmod + printfs.
- Edit `assert-not-main.sh:13` error message → lane-pool branch instruction.

### Step 2 — ADR edits (edit-in-place + Changelog)
- ADR-008: rewrite git-wt Decision points to lane-pool; keep git-native-hooks
  pillars; restate invariant as no-work-on-`main`; one `## Changelog` line.
- ADR-040: "feeds `git wt`" → "feeds the `<type>` of the branch you create
  manually"; Changelog line if body changed.
- ADR-015: "git wt auto-symlinks ml/models" → "each lane is symlinked during
  lane setup"; Changelog line if body changed.
- ADR-016: edit only if it names the tool.

### Step 3 — Rules + routing docs sweep
- `docs/rules/worktree-workflow.md` → single lane-pool mode.
- AGENTS.md (flow step 3 + pipeline diagram), README.md, scripts/AGENTS.md,
  docs/architecture.md, docs/decisions/README.md,
  `docs/rules/{pr-decomposition-and-review,github-labels,ml-models,
  ml-filesystem-layout,README}.md`.
- Skill mirrors: `.agents/skills/{worktree-workflow,git-workflow-and-versioning,
  m1-pro-lab}/SKILL.md` + `.codex/skills/worktree-workflow/SKILL.md`. (These are
  symlinked SSOT per AGENTS.md — edit the `.agents` source; the `.codex` mirror
  follows. Verify symlink vs real file before editing.)

### Step 4 — CI / GitHub surfaces (wording only)
- `pr-check.yml` branch-name guidance message; `issue-auto-label.yml` header
  comment; `ISSUE_TEMPLATE/task.yml` Type field description. Logic unchanged.

### Step 5 — Verify (NO worktree deletion — user hard constraint)
- `rg -n "git wt|wt\.sh|alias\.wt" -- . ':!docs/exec-plan/archive' ':!docs/exec-plan/active/*/'`
  → zero live instructions on editable surfaces (historical exec-plans excluded).
- Prove invariant: invoke `assert-not-main.sh` with HEAD on `main` (or unit-style)
  → non-zero exit. Re-run `setup-hooks.sh` → sets hooksPath, no alias.
- `pnpm typecheck` + lint (changed packages) — expect no-ops (docs/shell only).

### Step 6 — PR → review → merge → archive
- Push, open PR (`refactor: retire git wt; lane-pool is the single worktree mode
  (#407)`), trailer. Wait for `ci-gate` green (never merge on pending/red).
- Separate-lane review pass (`code-reviewer`/`critic`), then merge.
- Archive: `status: done` in plan frontmatter; `git mv` folder to `archive/`.
  ADR-008 distill already done in Step 2 (edited in place).
- Final `/skill:documents` compliance check.
- Return lane-1 to idle: `git switch lane/1` (worktree kept; never deleted).

## Risks & mitigations
- **R1 over-deletion of enforcement** → Step 1 touches only `wt.sh` + alias;
  Step 5 proves `assert-not-main` still fails a main commit.
- **R2 editing immutable history** → hard-exclude `docs/exec-plan/archive/**`
  and finalized active plan bodies; rg gate scopes them out.
- **R3 ADR supersede-chain temptation** → edit-in-place + one Changelog line.
- **R4 stale `git config alias.wt` in existing clones** → setup-hooks stops
  setting it; doc note: `git config --unset alias.wt` if desired.
- **R5 missed reference** → grep-driven sweep + Step 5 exhaustiveness gate
  against the independent inventory.
- **R6 lane safety** → NEVER delete/move a lane worktree; work via branch inside
  lane-1; restore `lane/1` at the end.
