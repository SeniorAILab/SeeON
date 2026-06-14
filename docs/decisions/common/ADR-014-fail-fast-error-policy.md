# ADR-014: Fail-Fast Error Policy — Explicit Refusal over Silent Fallback

## Status

Accepted.

## Date

2026-06-10

## Context

This system detects falls. Its worst failure mode is not a crash — it is **silent
degradation**: code that swallows an error, substitutes a plausible default, and keeps
running while the thing it exists to detect goes unreported. A crashed worker gets
restarted and investigated; a fake fallback gets discovered after a resident has been on
the floor for an hour.

Despite that, the repo's tooling at the time of this decision actively *weakened*
fail-fast defaults:

- `ml/` ruff selected only `E, F, I, UP` — `try: ... except: pass` passed lint.
- `backend/` carried NestJS boilerplate overrides: `no-floating-promises: warn` (an
  unhandled async rejection — TypeScript's most common silent failure — produced a
  warning nobody reads), `no-explicit-any: off`, `noImplicitAny: false`,
  `noFallthroughCasesInSwitch: false`.
- Nothing detected duplicate logic, the second stability hazard: two implementations of
  the same check drift apart, and the stale one becomes a latent fake fallback.

Adversarially-verified research (`docs/research/code-stability-enforcement-practices.md`)
shows the organizations that solved this — NASA/JPL (Power of Ten Rules 5 and 7),
TigerBeetle (Tiger Style: *"The only correct way to handle corrupt code is to crash"*,
*"No silent failures permitted"*) — share one meta-pattern: **the principle is encoded as
a deny-list of mechanically checkable violations**, not as advisory prose. Advisory-only
formulations did not survive verification anywhere. LLM coding agents exhibit the same
fail-silent pathology (Karpathy, 2026-01: models "make wrong assumptions … and just run
along with them"), which makes mechanical gates more load-bearing, not less, in an
agent-driven repo.

## Decision

1. **Fail-fast is the default error policy across `ml/`, `backend/`, and `front/`.**
   When code cannot fulfill its contract, it refuses explicitly — a typed, domain-specific
   exception (Python) or `Error` subclass (TypeScript) — and lets the failure propagate to
   a boundary that can act on it visibly. Returning a default, empty, or mocked value in
   place of a failure ("fake fallback") is forbidden in production code paths.

2. **Enforcement is mechanical, not advisory.** The policy is operationalized as lint and
   build gates (ruff deny-rules, typescript-eslint rules, `tsc --strict`, jscpd) plus a
   small set of grep-able review rules. The concrete deny-list lives in
   `docs/rules/code-stability.md` and may evolve (rules added, noisy sub-rules ignored
   with documented reasons) without reopening this ADR — this ADR owns the *policy*, the
   rule doc owns the *list*.

3. **Broad catches are legal only at process boundaries.** A top-level loop that must
   outlive one bad iteration (per-frame inference, request handling) may catch broadly
   iff it logs the full traceback and carries an inline justification. A boundary catch
   that substitutes a default result instead of logging-and-continuing violates clause 1.

4. **Intentional degradation must be loud.** If a future component genuinely needs a
   resilience fallback (circuit breaker, degraded mode), it must be explicit in code,
   logged at error level, and surfaced to operators (alert/metric). Silent degradation is
   never legitimate. The taxonomy of *when* such fallbacks are warranted is an open
   research question (research doc §7.1) and is deliberately **not** decided here; until
   a future ADR decides it, the default stands: fail fast.

### MECE boundary (mandatory — ADRs must be MECE)

| Concern | Owner |
|---|---|
| Error-handling **policy**: fail-fast, typed refusal, boundary rule, loud degradation | **ADR-014 (this)** |
| The concrete **deny-list** (lint rule IDs, exemption mechanics) | `docs/rules/code-stability.md` |
| **ML inference quality** — model runs but confidently misses falls (no exception exists to propagate) | Excluded — runtime-monitoring concern, future research/ADR |
| Classifier content, model-seam, data strategy | ADR-009 / ADR-026 / ADR-012 (untouched) |
| Repo/dependency topology (jscpd lands as root tooling devDependency) | ADR-001 (consistent with its orchestration-shell role) |

## Alternatives Considered

### A. Graceful degradation by default
**Rejected.** Appropriate for availability-first systems (a video site serving a lower
bitrate). Inverted here: our cost asymmetry is missed-fall ≫ crashed-worker, and a silent
fallback converts the former into an undetectable event.

### B. Advisory style guide only (no gates)
**Rejected.** The research pass found no surviving evidence that advisory prose enforces
anything; every verified standard was mechanical (assertion-density floors, return-value
checks, bound checks). In an agent-driven repo, prose rules also do not bind LLM agents
reliably — the Karpathy finding is precisely that agents proceed silently past them.

### C. Defensive programming (catch everything, return safe defaults)
**Rejected.** This is the fake-fallback anti-pattern institutionalized. It optimizes for
"no stack traces" — the wrong metric in a system whose failures must be visible.

### D. Wholesale adoption of a safety standard (full NASA P10 / Tiger Style)
**Rejected for now.** Assertion-density floors, total resource bounding, and
production-enabled assertions are coherent but heavyweight for a PoC-stage codebase.
We adopt the transferable deny-list subset; a future ADR can ratchet up if the system
approaches deployment in a real facility.

## Consequences

**Positive:**
- Bugs surface at introduction time (lint/build) instead of silently at runtime.
- One uniform answer to "what does this code do on error?" — it refuses, visibly.
- Mechanical gates constrain AI agents the same way they constrain humans.
- Locked configs stop the boilerplate-default drift that produced the current gaps.

**Negative / Trade-offs:**
- One-time fix cost for violations the new gates surface, and ongoing friction
  (legitimate boundary catches need explicit justification markers).
- Crash-vs-degrade tension is resolved bluntly (always fail fast) until the deferred
  resilience taxonomy is decided — possible over-eager failures in genuinely degradable
  paths.
- `front/` is gated only by `tsc --strict` for now; its lint hardening is follow-up work.

## Relationship to Other ADRs

- **References ADR-001** — jscpd enters as a root-level tooling devDependency, within the
  orchestration-shell role ADR-001 assigns to the root `package.json`.
- **Does not touch ADR-022/023/026/012/009** — serving/training split, ML/backend boundary, seams, layouts,
  and classifier strategy are unaffected; this ADR governs how their code *fails*.
- **Recorded by** `docs/rules/code-stability.md` (standing rule) and implemented via plan
  `code-stability-enforcement` (issue #51).
