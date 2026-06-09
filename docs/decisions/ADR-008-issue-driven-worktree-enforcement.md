# ADR-008: Issue-Driven Worktrees, Enforced Git-Natively from One Source of Truth

## Status

Accepted.

## Date

2026-06-09

## Context

Three actors now commit to this repository — Claude Code, Codex, and humans —
and nothing made them work the same way. Branches were named ad hoc, work
happened directly on `main`, and a worktree torn down with `rm -rf` left phantom
`.git/worktrees/` entries that blocked checkout and `git branch -d` until a
manual `git worktree prune`. As the project moves toward production, an
inconsistent, bypassable, per-actor workflow is a liability: violations are
caught late (at review or on the remote), if at all.

Two cross-cutting questions had no recorded answer:

1. **What is the unit of work, and how is a branch/worktree derived from it?**
   There was no convention tying a branch to a tracked issue, and no tool maps a
   GitHub issue to a worktree (confirmed by research run `wf_eb2eff77-150`).
2. **Where does enforcement live so it is identical for every actor?** Agent-level
   instructions are advisory and drift between Claude and Codex; the user's
   explicit requirement was *systemic* blocking — "agent 단에서 할 필요 없이
   시스템적으로 차단" — with hooks that are *identical across agents*.

This is a **workflow-and-enforcement** decision: *what is the unit of work, and at
which layer is the rule made unbypassable for all actors?* It does not govern
remote branch cleanup, CI merge gates, or release automation (out of scope).

## Decision

**One issue → one branch → one worktree, enforced at the git layer from a single
source of truth.**

1. **Unit of work.** Each GitHub issue maps to exactly one branch named
   `<type>/<issue#>-<slug>` and one isolated git worktree. `<type>` is read from
   the issue's `type:` label (feat/fix/chore/…, fallback `feat`); `<slug>` is the
   slugified title. The worktree lives outside the repo so it never dirties
   status.

2. **Single source of truth.** All enforcement logic is POSIX `sh` in
   `scripts/git-guard/` (`lib.sh`, `assert-not-main.sh`, `check-freshness.sh`,
   `wt.sh`). No layer reimplements it — every layer *invokes* these scripts.
   Change behavior once, and it is identical across every actor by construction.

3. **Git-native enforcement is primary.** `git config core.hooksPath .githooks`
   wires `.githooks/pre-commit` and `.githooks/pre-push` to the guard scripts.
   Commits and pushes on a protected branch (`main`) are refused. A stale tree
   (behind upstream) **blocks push** but only **warns on commit** — freshness is a
   push-time gate, not a per-commit nuisance.

4. **Agent hooks are early guidance, not the gate.** Claude (`.claude/settings.json`
   `PreToolUse` Edit/Write + `SessionStart` freshness) and Codex
   (`.codex/config.toml [hooks]`) call the *same* scripts to fail fast with a
   helpful message. Codex hooks see only shell commands, not file edits — that gap
   is acceptable because the git-native `pre-commit` catches the edit at commit
   time regardless of actor.

5. **One front door.** `scripts/git-guard/setup-hooks.sh` (run once per clone)
   sets `core.hooksPath` and registers a `git wt` alias →
   `wt.sh`. `git wt <issue#>` creates the worktree; `git wt rm <issue#>` tears it
   down via `git worktree remove` + `git worktree prune` (never `rm -rf`), so no
   phantom entry is left and `git branch -d` works afterward without manual prune.

6. **Escape hatch.** `GIT_GUARD_PROTECTED=` (empty) disables the protected-branch
   check for deliberate maintenance on `main` — documented, explicit, opt-in.

The rule itself lives in `docs/rules/worktree-workflow.md`; this ADR records *why*
the enforcement is shaped this way.

## Alternatives Considered

### A. husky / a Node-coupled hook manager

**Rejected.** It ties enforcement to a JavaScript runtime and `node_modules`. This
is a polyglot monorepo (ADR-001) where Python-only and shell-only contributors —
and Codex — must be governed identically. POSIX `sh` + `core.hooksPath` has no
runtime dependency and is tool-agnostic by construction.

### B. Agent-only hooks (Claude/Codex instructions, no git hooks)

**Rejected.** Advisory and bypassable — a human on the CLI, or any actor invoking
git directly, escapes it entirely, and the two agents' instructions drift apart
over time. It fails the user's explicit requirement that blocking be *systemic*
and *identical across agents*. Agent hooks are kept, but demoted to early
guidance layered on top of the git-native gate.

### C. Remote-only enforcement (branch protection / CI, no local hooks)

**Rejected.** It catches violations too late — after work is already committed
and pushed — wasting a round trip and, worse, allowing a polluted local history
to form on `main`. Local refusal at commit/push time prevents the bad state from
ever existing. (Remote protection remains complementary and is tracked separately,
out of scope here.)

### D. Per-layer duplicated logic (each hook reimplements the check)

**Rejected.** Copies drift. The user's requirement that hooks be *identical across
agents* is only guaranteed if there is literally one implementation. Hence the
`scripts/git-guard/` single-source-of-truth pattern, with every layer a thin
invoker.

## Consequences

**Positive:**

- Every actor — Claude, Codex, human — follows one workflow, enforced at the layer
  none of them can bypass. Behavior is identical by construction, not by
  discipline.
- Bad states (work on `main`, stale push) are prevented locally before they exist,
  not detected after the fact.
- Teardown is safe: `git wt rm` leaves no phantom worktree, so branch deletion just
  works.
- Adding a new actor or front-end means writing one more thin invoker of the same
  scripts — no logic to re-derive.

**Negative / Trade-offs:**

- Enforcement is **local** and requires `setup-hooks.sh` to be run once per clone;
  a clone that skips setup is unguarded until it does. The rule doc makes this a
  documented onboarding step (remote protection, when added, will backstop it).
- Codex hooks are shell-scope only and cannot inspect file edits; the git-native
  `pre-commit` is the real guarantee for edit-time violations.
- The `GIT_GUARD_PROTECTED=` escape hatch is, by design, a way to bypass the gate —
  acceptable because it is explicit and auditable, but it does mean the gate is not
  absolute.
- Freshness checks run `git fetch`; offline use degrades to a warning rather than a
  hard guarantee.
