# ADR-026: Postgres alert event and delivery outbox model

## Status
Accepted

## Date
2026-06-13

## Context

Fall alerts are external side effects. A retrying edge client, backend crash, provider timeout, or invalid token must not create ambiguous state or duplicate Kakao messages. JSONL audit was enough for the pilot, but production hardening needs queryable state and database-backed idempotency.

ADR-002 already selects PostgreSQL with Prisma for backend persistence.

## Decision

Add two Prisma/Postgres models:

- `AlertEvent`: canonical backend record keyed by `(source_id, external_event_id)`, including event type, detected time, confidence or prediction fields, backend decision, and suppression reason.
- `DeliveryAttempt`: retry/audit outbox record linked to an `AlertEvent`, including channel, status, attempt count, next attempt time, provider reference, failure class, terminal reason, operator action, and timestamps.

The first `DeliveryAttempt` is created transactionally with the `AlertEvent` only when policy decides to dispatch. This slice dispatches synchronously after commit, then records `SENT`, `RETRY_SCHEDULED`, or `TERMINAL_FAILED`. The schema remains worker-ready through `PENDING`, `RETRY_SCHEDULED`, and `next_attempt_at`.

Legal delivery transitions for this slice:

- `PENDING` → `SENT`
- `PENDING` → `RETRY_SCHEDULED`
- `PENDING` → `TERMINAL_FAILED`
- `RETRY_SCHEDULED` → future worker/manual retry path (deferred)

## Alternatives Considered

### JSONL audit only
- Pros: simple and already used in the pilot.
- Cons: no relational idempotency, no queryable retry state, no transactional event/delivery boundary.
- Rejected: insufficient for production hardening.

### Send first, persist after provider response
- Pros: fewer pending records.
- Cons: crash window can lose evidence or duplicate sends.
- Rejected: durable state must precede external side effects.

### Full background worker in this slice
- Pros: stronger production retry loop.
- Cons: larger scope; scheduling and operations require additional decisions.
- Deferred: the model is worker-ready, but complete worker execution can follow later.

## Consequences

- Duplicate `(source_id, external_event_id)` requests are answered from existing state.
- Channel dispatch can be retried or surfaced to operators without replaying ingress blindly.
- Tests must cover idempotency, transition recording, and transient vs terminal failure persistence.
