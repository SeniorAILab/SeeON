---
slug: code-stability-enforcement
title: "Code-Stability Deny-List — Lint Gates, Rule Doc, ADR-014, Skill Augmentation"
type: plan
date: 2026-06-10
author: gobeumsu (via Claude Fable 5)
issue: 51
status: active
---
<!-- NOTE: plan body is immutable after finalize.
     Finalize = the first git commit that includes this plan.md in docs/exec-plan/active/.
     Scope change -> create a new slug, then set:
       status: superseded-by
       superseded-by: {new-slug}
     Only the frontmatter status line(s) are mutable post-finalize. -->

## Requirements Summary

Code-level stability principles — no fake fallbacks (error-masking defaults), explicit refusal
on error (typed exceptions), no duplicate logic — are currently convention-only and unenforced:

- `ml/pyproject.toml` ruff selects only `E, F, I, UP`: **zero error-swallowing rules**.
  `try: ... except: pass` passes lint today.
- `backend/` explicitly weakens fail-fast defaults inherited from NestJS boilerplate:
  `no-floating-promises: warn`, `no-explicit-any: off`, `no-unsafe-argument: warn`,
  `noImplicitAny: false`, `noFallthroughCasesInSwitch: false`.
- No duplicate-logic detection anywhere; no Python type checker.

Research basis: `docs/research/code-stability-enforcement-practices.md` (deep-research
wf_f3efc759-85a, 3-vote adversarial verification). Verified finding: surviving enforcement
standards (NASA/JPL Power of Ten Rules 5/7, TigerBeetle Tiger Style) are all **deny-lists of
mechanically checkable violations**, not advisory prose. This plan applies that pattern to
our Python/TypeScript stack.

## Deliverables

1. **`docs/rules/code-stability.md`** — the deny-list rule doc. Machine-checkable patterns
   only; every rule maps to a lint rule ID or a grep-able pattern. Index row added to
   `docs/rules/README.md`.
2. **`docs/decisions/ADR-014-fail-fast-error-policy.md`** — the cross-cutting decision:
   fail-fast over silent fallback, typed refusal at boundaries, enforcement-as-lint.
   Index row added to `docs/decisions/README.md`. MECE: does not reopen ADR-009 (classifier
   content) and explicitly excludes ML inference-quality monitoring (separate layer).
3. **ml lint gates** — `[tool.ruff.lint]` select adds `B`, `BLE`, `S110`, `S112`, `TRY`
   (noisy TRY sub-rules may be ignored with documented reasons). All surfaced violations
   fixed in the same PR — a gate that ships red is itself a fake fallback.
4. **backend hardening** — eslint: drop the three weakening overrides, add
   `only-throw-error`, `prefer-promise-reject-errors`, `switch-exhaustiveness-check`,
   `no-non-null-assertion`. tsconfig: `strict: true`, drop `noImplicitAny: false` /
   `strictBindCallApply: false`, set `noFallthroughCasesInSwitch: true`,
   add `noImplicitReturns: true`. Violations fixed in the same PR.
5. **Duplicate-logic gate** — `jscpd` as root devDependency (tooling, consistent with
   ADR-001's orchestration-shell role) + root script `dupcheck` covering `ml/`,
   `backend/src/`, `front/src/`. Threshold gate; semantic duplication stays a review rule.
6. **Skill augmentation** — `test-driven-development`: error paths are RED-GREEN targets
   (assert typed refusal, never assert fallback values); `code-review-and-quality`:
   stability axis referencing the rule doc. Both mirrored `.agents/` ↔ `.claude/`.

## Execution Order (atomic commits)

1. `docs(research)`: add research report + this plan (plan finalizes here).
2. `docs(rules,adr)`: rule doc + ADR-014 + both README indexes.
3. `chore(ml)`: ruff gate expansion + violation fixes.
4. `chore(backend)`: eslint/tsconfig hardening + violation fixes.
5. `chore`: jscpd root devDep + `dupcheck` script.
6. `docs(skills)`: TDD + code-review skill stability sections, all mirrors.

## Verification

- `uv run ruff check .` clean in `ml/` with new select set.
- `pnpm -C backend lint` and `pnpm -C backend build` (tsc) clean with hardened config.
- `pnpm -C front lint` still clean (front untouched, regression check).
- `pnpm dupcheck` runs and reports under threshold.
- `ml` test suite passes: `uv run pytest`.
- Skill mirrors identical: `diff -r .agents/skills .claude/skills` (modulo `.codex` symlinks).

## Out of Scope (explicit refusals)

- **mypy/pyright for `ml/`** — typed refusal at boundaries is partially served by pydantic
  (already a dependency); a full type-checker rollout over 60 untyped PoC files is its own
  work item. Follow-up issue, not this PR.
- **CI workflow wiring** — no `.github/workflows/` exists yet; gates land as local/lint
  commands now, CI adoption is a separate chore.
- **front lint hardening** — `front/` already has `strict: true` and Next defaults;
  type-aware eslint for Next is a separate decision.
- **ML inference-quality monitoring** (silent model failure — confident-but-wrong outputs)
  — research §3 shows this is a structurally different layer from code-level gates.
  Excluded from ADR-014 scope; future research/ADR.
- **fallback-legitimacy boundary** (circuit breakers vs error masks) — open question §7.1
  in the research doc; ADR-014 records the default (fail fast) and defers the resilience
  exception taxonomy.
