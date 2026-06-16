# ADR-039: PR Size Hard-Gate Threshold — Logic Churn > 1000

## Status

Accepted. **Complements ADR-008** (issue-driven worktrees) and **ADR-016** (enforcement
timing). Refines the `.github/workflows/pr-check.yml` size gate that was ported from
`Yeachan-Heo/oh-my-claudecode`; the standing convention lives in
`docs/rules/pr-decomposition-and-review.md`.

## Date

2026-06-16

## Context

The CI size gate (`.github/workflows/pr-check.yml`) hard-failed any PR whose **logic
churn** exceeded **500** without a `size/override` label. Logic churn already excludes
non-logic files (markdown/`docs/`, tests, `prisma/migrations/`, `pnpm-lock.yaml`), so the
gate measures only reviewable code change.

In practice a 500-logic-churn hard ceiling was too tight for legitimately cohesive,
reviewable slices, producing frequent `size/override` escapes that erode the gate's
signal. The upstream oh-my-claudecode pattern uses a 1000-line threshold (a warning on
raw additions+deletions). This repo wanted the **1000 ergonomic** while keeping its
stricter, smarter **logic-churn** basis rather than regressing to a raw-line count.

## Decision

Relax the hard-fail threshold from logic churn **> 500** to **> 1000** in
`.github/workflows/pr-check.yml`, keeping the gate **logic-churn-based** and **hard**:

- Hard fail when `logicChurn > 1000 && !hasOverride` (XL).
- `size/override` remains the audited escape hatch.
- Buckets are unchanged: `S<=100 / M<=500 / L<=1000 / XL>1000`. `size/L` (501–1000) is now
  a **recommended split**, not a hard block; only `size/XL` (>1000) hard-blocks.
- Classification is unchanged: markdown/`docs/`, tests, `prisma/migrations/`, and
  `pnpm-lock.yaml` stay **non-logic** and never count toward the gate — markdown is free
  from the pre-check by design.
- Base-branch and draft jobs are unchanged.

## Drivers

1. 500 logic churn was too tight for cohesive reviewable slices, causing `size/override` churn.
2. Adopt the oh-my-claudecode 1000 ergonomic without regressing to raw-line counting.
3. Keep the gate logic-only and hard so non-code (docs/tests/lock) is never gated.

## Alternatives considered

- **Keep 500 hard (rejected).** Continued override churn and signal erosion.
- **Replace with raw additions+deletions > 1000 like upstream (rejected).** Regression —
  loses the docs/tests/migration/lock exclusions that make the gate meaningful.
- **Add a second raw-churn gate on top of logic > 500 (rejected).** Double gate, more
  friction, no clear benefit.
- **Relax logic threshold to 1000, keep hard + logic basis (chosen).**

## Why chosen

Satisfies the "1000 hard" ergonomic the team wanted while preserving the logic-churn
precision (markdown/tests/migrations/lock excluded) that distinguishes this gate from a
naive line counter, and avoids the upstream raw-line regression.

## Consequences

- `size/L` PRs (501–1000 logic churn) merge without a hard block; reviewers treat `size/L`
  as a recommended-split signal, documented in `docs/rules/pr-decomposition-and-review.md`.
- Fewer `size/override` escapes; the override label regains its "audited exception" meaning.
- This governance relaxation is recorded here so the threshold change stays traceable and
  reversible by a successor ADR if the signal degrades.

## Follow-ups

- Branch-protection / required-status-check enforcement of the gate remains a separate,
  deferred decision (out of scope here).
- A lint CI job and a new-issue auto-label workflow are tracked separately (issue #167, PR5).
