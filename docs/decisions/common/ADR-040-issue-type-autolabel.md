# ADR-040: Issue Type Auto-Label — Fail-Closed Mapping to `type:` Label

## Status

Accepted. **Complements ADR-008** (issue-driven worktrees): the `type:` label is the
source of truth for the branch `<type>` prefix created by `git wt <issue#>` (see
`docs/rules/worktree-workflow.md` and `docs/rules/github-labels.md`).

## Date

2026-06-16

## Context

The issue form (`.github/ISSUE_TEMPLATE/task.yml`) has a required **Type** dropdown but
sets `labels: []`, so a newly opened issue carries no `type:` label until someone adds it
by hand. `git wt <issue#>` reads the issue's `type:` label to derive the branch prefix and
**falls back to `feat`** when none is present — silently producing wrong branch prefixes
for `fix`/`chore`/`docs`/`refactor`/`test` work. No automation closed this gap.

## Decision

Add `.github/workflows/issue-auto-label.yml` (github-script) that maps the issue form
**Type** selection to exactly one `type:` label:

- Triggers on `issues: [opened, edited]` and `workflow_dispatch`.
- Declares minimal `permissions: { contents: read, issues: write }`.
- Parses the `### Type` section's selected option and maps its prefix to one of
  `type: feat|fix|chore|docs|refactor|test`.
- **Fail-closed**: if the Type field is missing, blank, malformed, or an unknown prefix,
  it applies **no** label, performs **no** cleanup, and emits an explicit `core.warning`.
  It **never** falls back to `type: feat` or any other default.
- On a valid parse only: removes any stale `type:` labels and adds exactly the mapped one.
- Preserves all non-`type:` labels (`domain:`, historical `priority:*`, `size/*`, others).

## Drivers

1. Close the `git wt` `feat`-fallback gap so branch `<type>` matches the issue's Type.
2. Keep the `type:` label taxonomy authoritative without manual toil.
3. Minimal automation — no broad upstream auto-labeler, no other label classes touched.

## Alternatives considered

- **Manual labeling only (rejected).** The fallback gap persists; humans forget.
- **Default to `type: feat` on missing/unknown (rejected).** Silently masks the error and
  produces wrong branch prefixes — violates fail-fast (ADR-014).
- **Import the full upstream auto-labeler (rejected).** Out of scope; touches more label
  classes than intended.
- **Fail-closed Type→`type:` mapping (chosen).**

## Consequences

- New/edited issues converge on a correct single `type:` label automatically.
- A missing/unknown Type is surfaced as a warning rather than silently defaulted, so the
  author fixes the form instead of getting a wrong branch prefix.
- Behavior is verified by reasoning tests (6 options, missing/unknown fail-closed,
  duplicate-`type:` cleanup, non-`type:` preservation, idempotency).

## Follow-ups

- Enforcing the workflow as a required status check (branch protection) remains a
  separate, deferred decision (out of scope here).
