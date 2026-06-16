# PR Decomposition and Review

> Standing convention for keeping PRs reviewable. Complements
> `docs/rules/worktree-workflow.md`, `.github/workflows/pr-check.yml`, and
> `docs/research/bulk-pr-splitting-strategy.md`.

## Rule

Every PR must be one reviewable change. If the size gate reports `size/L` or
`size/XL`, split before merge. The target is `size/M` or smaller.

The split unit is conceptual scope, not line count alone: a PR should have one
clear title without "and", be independently reviewable, and leave `main` in a
working state after merge.

## Issue to PR mapping

One issue may fan out into multiple PRs when the issue is larger than one
reviewable unit.

Use this pattern:

```text
Issue #N
  PR A: first self-contained slice
  PR B: second self-contained slice
  PR C: docs/tests/follow-up slice
```

For each PR body, state:

- which issue slice this PR implements;
- what was already merged;
- what is intentionally deferred;
- verification run for this slice.

When slices depend on each other, merge bottom-up in dependency order. Prefer a
merge commit for stacked branches when the next PR should shrink after the base
slice lands.

## Split triggers

Split before merge when any of these are true:

- Size Check labels the PR `size/L` or `size/XL`;
- the PR mixes behavior, refactor, tests, docs, and CI in ways that can be
  reviewed separately;
- reviewers need different expertise for different file groups;
- an unrelated cleanup is bundled with feature work;
- the PR cannot be summarized as one thing.

Do not bypass the gate by hiding generated files, weakening tests, or moving
large unrelated changes into the same PR. If an exceptional large PR is truly
required, document the reason in the PR body and use an explicit reviewer-owned
exception label only after human approval.

## Recommended split shapes

| Shape | Use when | Example |
| --- | --- | --- |
| Vertical slice | A feature can be delivered in small complete increments | UI labels first, test helpers second |
| Horizontal foundation | Later slices need a shared seam first | constants/helper module first, consumers later |
| File group | Different reviewers own different areas | CI workflow separate from docs rule |
| Docs/archive slice | Implementation is merged but lifecycle records remain | archive execution plans after code PRs |

## Review requirement

Every PR gets a review pass before merge, even when the author and reviewer are
both agents.

Review must check:

- correctness against the issue slice;
- size/scope discipline;
- test or verification adequacy;
- no unrelated `ml/data`, model artifact, or generated asset changes;
- docs/ADR/plan lifecycle alignment when the PR records decisions or work plans.

For agent-authored PRs, record the review result in the PR body or a PR comment
before merge. If findings require changes, push a follow-up commit and re-run the
smallest relevant verification.

## PR body template

```markdown
## Slice
- Part of #<issue>
- This PR does: ...
- Already merged: ...
- Deferred: ...

## Verification
- `command` → result

## Safety
- No dependency changes unless stated
- No `ml/data` / model artifact changes unless this PR is explicitly about data/models
- Size target: `size/M` or smaller
```

## Closing an issue

Close the issue only after every required slice is merged or explicitly moved to
a new issue. If a PR lands only part of the issue, leave a comment that names the
remaining work and keep the issue open.
