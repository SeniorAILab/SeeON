# ADR-008: Version Control — Issue-Driven Worktrees, PR Size Gate, and Type Auto-Label, From One Source of Truth

## Status

Accepted. This is the single decision record for the **version-control domain**: branch &
worktree lifecycle, PR size gating, and issue→`type:` labeling — the choices that govern how
every actor (Claude Code, Codex, humans) moves a unit of work from issue to merged PR.
**Complemented by ADR-016** (enforcement *timing*: what is denied at the earliest local point
vs. what is audit-tier — this ADR owns *where* and *what* the version-control rules are and
stays authoritative for that; ADR-016 owns the timing principle it shares with other domains).

The standing rules distilled from this decision live under `docs/rules/` and are reached
through the single hub `docs/rules/version-control.md`.

## Date

2026-06-09. Extended 2026-06-27 to absorb the former ADR-039 (PR size gate) and ADR-040
(issue type auto-label) so the version-control domain is one decision, not three (#393).

## Context

Three actors now commit to this repository — Claude Code, Codex, and humans — and nothing
made them work the same way. Branches were named ad hoc, work happened directly on `main`, and
a worktree torn down with `rm -rf` left phantom `.git/worktrees/` entries that blocked checkout
and `git branch -d` until a manual `git worktree prune`. As the project moves toward
production, an inconsistent, bypassable, per-actor workflow is a liability: violations are
caught late (at review or on the remote), if at all.

Three version-control questions had no single recorded answer:

1. **What is the unit of work, and how is a branch/worktree derived from it?** There was no
   convention tying a branch to a tracked issue, and no tool maps a GitHub issue to a worktree
   (confirmed by research run `wf_eb2eff77-150`).
2. **Where does enforcement live so it is identical for every actor?** Agent-level instructions
   are advisory and drift between Claude and Codex; the user's explicit requirement was
   *systemic* blocking — "agent 단에서 할 필요 없이 시스템적으로 차단" — with hooks
   *identical across agents*.
3. **How large may one PR be, and how does an issue's Type become a branch prefix?** A size
   ceiling that is too tight erodes its own signal through override churn; a `type:` label that
   must be added by hand silently produces wrong branch prefixes when forgotten.

This is a **workflow-and-enforcement** decision: *what is the unit of work, how big is a
reviewable change, how is its type derived, and at which layer is each rule made unbypassable
for all actors?* It does not govern remote branch cleanup, CI merge gates (required-status-check
enforcement is deferred), or release automation (out of scope).

## Decision

**One issue → one branch → one worktree → one reviewable PR, enforced from a single source of
truth.** Four parts, each with one rule SSOT under `docs/rules/` and the shared enforcement
scripts in `scripts/git-guard/`.

### 1. Issue-driven worktrees, enforced git-natively

1. **Unit of work.** Each GitHub issue maps to exactly one branch named
   `<type>/<issue#>-<slug>`, checked out inside a persistent lane (a worktree that lives outside
   the repo so it never dirties status). `<type>` is read from the issue's `type:` label
   (feat/fix/chore/…, fallback `feat`); `<slug>` is a short slug from the title.

2. **Single source of truth.** All enforcement logic is POSIX `sh` in `scripts/git-guard/`
   (`lib.sh`, `assert-not-main.sh`, `check-freshness.sh`, `sync-main.sh`). No layer reimplements
   it — every layer *invokes* these scripts. Change behavior once, and it is identical across
   every actor by construction.

3. **Git-native enforcement is primary.** `git config core.hooksPath .githooks` wires
   `.githooks/pre-commit` and `.githooks/pre-push` to the guard scripts. Commits and pushes on
   a protected branch (`main`) are refused. A stale tree (behind upstream) **blocks push** but
   only **warns on commit** — freshness is a push-time gate, not a per-commit nuisance.

4. **Agent hooks are early guidance, not the gate.** Claude (`.claude/settings.json`
   `PreToolUse` Edit/Write/NotebookEdit + `SessionStart` freshness) and Codex
   (`.codex/config.toml [hooks]`) call the *same* scripts to fail fast with a helpful message.
   Codex hooks see only shell commands, not file edits — that gap is acceptable because the
   git-native `pre-commit` catches the edit at commit time regardless of actor.

5. **One setup front door.** `scripts/git-guard/setup-hooks.sh` (run once per clone) sets
   `core.hooksPath` and chmods the guard scripts. Worktrees are a persistent **lane pool**
   created once with `git worktree add`; per-task branches are cut inside an idle lane with
   `git switch -c <type>/<issue#>-<slug> origin/main`, and the lane returns to an idle parking
   ref after merge. Lanes are not torn down per task; if a worktree must ever be removed, use
   `git worktree remove` + `git worktree prune` (never `rm -rf`) so no phantom entry is left.

6. **Escape hatch.** `GIT_GUARD_PROTECTED=` (empty) disables the protected-branch check for
   deliberate maintenance on `main` — documented, explicit, opt-in.

### 2. Worktree lifecycle: a persistent lane pool

The invariant above — one issue → one branch, never on a protected branch, fresh `origin/main`
per task, git-native gates — is fixed. The worktree lifecycle that realizes it is a **fixed pool
of persistent lanes**:

- A small set of `lane-N` worktrees is created once and reused across issues, keeping
  `node_modules`/`.venv` warm. Each task is cut onto its own per-issue feature branch from fresh
  `origin/main` inside an idle lane; on merge the lane returns to an idle parking ref.
- Concurrent agents cannot share one working directory, so a lane per agent is mandatory;
  capping the pool prevents worktree sprawl. There is no per-issue create/teardown churn and no
  issue→worktree automation tool — branches are named by hand from the issue's `type:` label.

Every gate in part 1 holds unchanged. The mechanics live in
`docs/rules/worktree-workflow.md`.

### 3. PR size gate — logic-churn based, hard at > 1000 (absorbed from former ADR-039)

A PR must be one reviewable change. The CI size gate (`.github/workflows/pr-check.yml`) scores
**logic churn only** and hard-fails the excessive case:

- **Hard fail** when `logicChurn > 1000 && !hasOverride` (`size/XL`); `size/override` is the
  audited escape hatch.
- Buckets: `S<=100 / M<=500 / L<=1000 / XL>1000`. `size/L` (501–1000) is a **recommended
  split**, not a hard block; only `size/XL` (>1000) hard-blocks. Target is `size/M` or smaller.
- **Logic-churn basis:** markdown / `docs/`, tests, `prisma/migrations/`, and `pnpm-lock.yaml`
  are **non-logic** and never count toward the gate (markdown is free from the pre-check by
  design). Base-branch and draft jobs are unchanged.

This threshold was relaxed from a `> 500` hard ceiling, which proved too tight for legitimately
cohesive slices and produced frequent `size/override` escapes that eroded the gate's signal.
The `> 1000` value adopts the upstream `oh-my-claudecode` ergonomic while keeping this repo's
stricter, smarter **logic-churn** basis rather than regressing to a raw additions+deletions
count (which would lose the docs/tests/migration/lock exclusions that make the gate meaningful).
The standing convention lives in `docs/rules/pr-decomposition-and-review.md`.

### 4. Issue Type auto-label — fail-closed mapping to `type:` (absorbed from former ADR-040)

The `type:` label is the source of truth for the branch `<type>` prefix you write when cutting
the feature branch (`git switch -c <type>/<issue#>-<slug>`). Because the issue form
(`.github/ISSUE_TEMPLATE/task.yml`) has a required **Type** dropdown but opens issues with
`labels: []`, a new issue carries no `type:` label until someone adds it by hand — so the author
has nothing authoritative to copy the prefix from and is liable to guess wrong for
`fix`/`chore`/`docs`/`refactor`/`test` work. `.github/workflows/issue-auto-label.yml`
(github-script) closes that gap:

- Triggers on `issues: [opened, edited]` and `workflow_dispatch`; declares minimal
  `permissions: { contents: read, issues: write }`.
- Parses the `### Type` selection and maps its prefix to exactly one of
  `type: feat|fix|chore|docs|refactor|test`.
- **Fail-closed:** if the Type field is missing, blank, malformed, or an unknown prefix, it
  applies **no** label, performs **no** cleanup, and emits an explicit `core.warning`. It
  **never** falls back to `type: feat` or any other default (fail-fast, ADR-014).
- On a valid parse only: removes any stale `type:` labels and adds exactly the mapped one;
  preserves all non-`type:` labels (`domain:`, `size/*`, others).

The label taxonomy itself lives in `docs/rules/github-labels.md`.

### 5. Commit format — conventional-commit subject reusing the `<type>` prefix

Commits use a Conventional-Commits subject `<type>(<scope>): <imperative summary>` whose
`<type>` is the **same six-prefix vocabulary** as the branch `<type>` and the issue `type:`
label (feat/fix/chore/docs/refactor/test). Reusing one vocabulary across issue → branch →
commit keeps the unit of work traceable end to end and lets a reader infer intent at every
layer without a second mapping. Commits are atomic (one logical change), and agent authorship
is recorded with a `Co-Authored-By` trailer. The mechanical rule (subject form, body, scope,
trailers) lives in `docs/rules/commit-convention.md`; this clause only fixes that commit type
is not an independent taxonomy but the same one the rest of the domain already uses.

## Alternatives Considered

### A. husky / a Node-coupled hook manager (enforcement)

**Rejected.** It ties enforcement to a JavaScript runtime and `node_modules`. This is a
polyglot monorepo (ADR-001) where Python-only and shell-only contributors — and Codex — must be
governed identically. POSIX `sh` + `core.hooksPath` has no runtime dependency and is
tool-agnostic by construction.

### B. Agent-only hooks (no git hooks)

**Rejected.** Advisory and bypassable — a human on the CLI, or any actor invoking git directly,
escapes it entirely, and the two agents' instructions drift apart over time. It fails the
explicit requirement that blocking be *systemic* and *identical across agents*. Agent hooks are
kept but demoted to early guidance layered on top of the git-native gate.

### C. Remote-only enforcement (branch protection / CI, no local hooks)

**Rejected.** It catches violations too late — after work is committed and pushed — wasting a
round trip and allowing a polluted local history to form on `main`. Local refusal at
commit/push time prevents the bad state from ever existing. (Remote protection remains
complementary and is tracked separately, out of scope here.)

### D. Per-layer duplicated logic (each hook reimplements the check)

**Rejected.** Copies drift. The requirement that hooks be *identical across agents* is only
guaranteed if there is literally one implementation — hence the `scripts/git-guard/`
single-source-of-truth pattern, with every layer a thin invoker.

### E. PR size gate — keep `> 500` hard, or switch to raw line count

**Rejected (both).** Keeping `> 500` continued the override churn and signal erosion. Replacing
logic churn with raw additions+deletions > 1000 (the literal upstream pattern) is a regression:
it loses the docs/tests/migration/lock exclusions that make the gate meaningful. A second
raw-churn gate stacked on the logic gate adds friction with no clear benefit. Chosen: relax to
`> 1000` while keeping the gate hard and logic-churn-based.

### F. Type labeling — manual only, or default to `feat` on missing/unknown

**Rejected (both).** Manual-only leaves a prefix gap — without a label the author has nothing to
copy and guesses the branch `<type>`. Defaulting to `type: feat` on a missing/unknown Type
silently masks the error and produces wrong branch prefixes — violating fail-fast (ADR-014).
Chosen: fail-closed Type→`type:` mapping that warns instead of guessing.

## Consequences

**Positive:**

- Every actor — Claude, Codex, human — follows one version-control workflow, enforced at the
  layer none of them can bypass. Behavior is identical by construction, not by discipline.
- Bad states (work on `main`, stale push, oversized PR, wrong branch type) are prevented or
  flagged early rather than detected after the fact.
- Teardown is safe: lanes are reused, not deleted; a feature branch merges and the lane returns
  to its idle parking ref, so `git branch -D` just works and no phantom worktree is left.
- Adding a new actor or front-end means writing one more thin invoker of the same scripts.
- `size/L` PRs merge without a hard block (reviewers treat `size/L` as a recommended-split
  signal); fewer `size/override` escapes, so the override label regains its "audited exception"
  meaning.
- New/edited issues converge on a correct single `type:` label automatically; a missing/unknown
  Type surfaces as a warning so the author fixes the form instead of getting a wrong prefix.

**Negative / Trade-offs:**

- Enforcement is **local** and requires `setup-hooks.sh` once per clone; a clone that skips
  setup is unguarded until it does. The rule docs make this a documented onboarding step
  (remote protection, when added, will backstop it).
- Codex hooks are shell-scope only and cannot inspect file edits; the git-native `pre-commit`
  is the real guarantee for edit-time violations.
- The `GIT_GUARD_PROTECTED=` escape hatch and the `size/override` label are, by design, ways to
  bypass a gate — acceptable because both are explicit and auditable, but the gates are not
  absolute.
- The size and auto-label gates run in CI and are **advisory** until branch-protection /
  required-status-check enforcement is decided (deferred).
- Freshness checks run `git fetch`; offline use degrades to a warning rather than a hard
  guarantee.

## References

- ADR-016 — enforcement timing principle (irreversible-leak-blocks-early vs. audit-tier).
- ADR-014 — fail-fast error policy (basis for the fail-closed auto-label).
- ADR-001 — polyglot monorepo (why enforcement must be runtime-agnostic).

## Changelog

- 2026-06-09: Initial decision — issue-driven worktrees enforced git-natively from
  `scripts/git-guard/`.
- 2026-06-27: Broaden to the single **version-control** decision record. Add worktree-lifecycle
  modes (per-task default + lane pool for single-human concurrent agents). Absorb former ADR-039
  (PR size gate — logic churn, hard at > 1000) and ADR-040 (issue Type fail-closed auto-label);
  those ADR files are removed and their anchors forward here. ADR-016 stays a separate
  cross-cutting decision, only cross-linked (#393).
- 2026-06-27: Retire `git wt`/`wt.sh`. The worktree lifecycle is now a single persistent **lane
  pool** (branches cut with `git switch -c <type>/<issue#>-<slug> origin/main` inside a reused
  lane), not per-issue worktree automation. The hard-enforced invariant is reduced to **never
  work on `main`** (`assert-not-main` + CI head≠`main`); branch naming is demoted to a soft
  traceability convention. All other `scripts/git-guard/` scripts and `.githooks/` gates are
  unchanged (#407).
