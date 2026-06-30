# Version Control

> **Single entry point for the version-control domain.** `AGENTS.md` routes here; this hub
> routes to the four facet rules. No rule body lives here — each facet's SSOT owns its detail,
> and ADR records *why*
> the domain is shaped this way.

How a unit of work moves from a GitHub issue to a merged change. The domain is
captured in the ADR and expressed as four facets, each with exactly one
rule SSOT:

| Facet | Rule SSOT | Covers |
|-------|-----------|--------|
| **Branch & worktree** | [`worktree-workflow.md`](./worktree-workflow.md) | One issue → one branch `<type>/<issue#>-<slug>` cut with `git switch -c` inside a persistent lane; freshness gates; `git-guard` enforcement (the one hard invariant: never work on `main`). |
| **Issue labeling** | [`github-labels.md`](./github-labels.md) | The `type:`/`domain:` taxonomy; the required single `type:` label that drives the branch `<type>` (fail-closed auto-label). |
| **Commit** | [`commit-convention.md`](./commit-convention.md) | Conventional-commit subject reusing `<type>`, atomicity, body, Co-Authored-By trailers. |
| **PR, review & merge** | [`pr-decomposition-and-review.md`](./pr-decomposition-and-review.md) | One reviewable change; size gate (logic churn, hard at >1000); fan-out slices; per-PR review pass; merge discipline (local gate is the real gate). |

## Why (decisions)

- ADR — the single
  version-control decision: issue-driven worktrees enforced git-natively from one source, the
  PR size gate, and the issue Type auto-label.
- ADR — cross-cutting
  enforcement-*timing* principle (what blocks early vs. stays audit-tier); shared with other
  domains, not owned by version control.

## Enforcement

All gates run from one source so behavior is identical for Claude, Codex, and humans — see
[`worktree-workflow.md` §Setup after clone](./worktree-workflow.md#setup-after-clone) and its
Files table for the `scripts/git-guard/` + `.githooks/` mechanics.
