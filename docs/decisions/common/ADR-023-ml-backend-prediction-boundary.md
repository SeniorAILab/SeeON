# ADR-023: ML Prediction Boundary and Backend Product-Policy Ownership

## Status

Accepted. Supersedes the ML/backend responsibility-boundary clauses of [ADR-003](../ml/ADR-003-ml-serving-training-split.md). ADR-003 remains as the preserved historical source record.

## Date

2026-06-13

## Context

ADR-003 originally bundled ML serving/training lifecycle structure with the product boundary between ML inference and backend alert logic. Those concerns can change independently: ML can change its internal lifecycle without changing who owns alert policy, and backend alert policy can evolve without changing the ML project layout.

This ADR extracts the active cross-domain boundary so it is explicit in the `common/` category rather than hidden inside an ML-heavy ADR.

## Decision

ML returns model signals. Backend owns product decisions and external side effects.

Concretely:

- The ML serving API returns prediction data such as model identity, version/type, and fall probability or equivalent model-level signal.
- ML does **not** own product alert policy, deduplication, rate limiting, notification dispatch, persistence policy, or caregiver/operator workflow semantics.
- The NestJS backend owns threshold policy, deduplication, rate limiting, persistence, webhook/notification dispatch, and any product decision derived from ML output.
- A change to the prediction contract requires coordinated review of both ML and backend consumers, but the ownership line remains: ML predicts; backend decides and acts.

## Strict common gate

This ADR belongs in `common/` because, after splitting ML lifecycle concerns into ADR-022, the boundary still irreducibly constrains at least two domains:

- `ml/` must keep serving outputs as model-level signals.
- `backend/` must own alert/product policy and external side effects.

Placing this decision in either `ml/` or `backend/` alone would hide the other side's obligation and weaken the contract.

## Alternatives Considered

### Let ML emit alert events directly

Rejected for the production boundary. It would move product policy and side-effect responsibility into the ML service, coupling model iteration to notification semantics and persistence/retry behavior.

### Let backend embed Python inference

Rejected because it collapses Python ML runtime concerns into the TypeScript backend and prevents the ML team from changing inference internals independently.

### Treat the boundary as implementation detail only

Rejected. This boundary affects API design, ownership, test shape, and future alert integrations. It is expensive to reverse and belongs in ADR form.

## Consequences

**Positive:**

- Backend alert behavior can evolve without changing ML model internals.
- ML model iteration stays focused on prediction quality and serving contract stability.
- Future docs and plans have a clear place to find the product-policy ownership rule.

**Negative / trade-offs:**

- Cross-domain changes still require coordination whenever the prediction schema changes.
- The boundary is enforced by ADR/rule/review discipline rather than a schema registry today.

## Source preservation

This ADR preserves the active ML/backend boundary from ADR-003. The original ADR-003 text remains in the historical corpus and is not shortened or deleted.
