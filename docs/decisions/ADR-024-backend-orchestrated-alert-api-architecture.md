# ADR-024: Backend-orchestrated alert API architecture

## Status
Accepted

## Date
2026-06-13

## Context

Kakao fall alerts need a production-grade path, but the existing pilot proved a backend-driven Kakao send-to-me flow from demo/live inputs. The production system has two different contracts that must not collapse:

- FastAPI `/predict` returns model signal only: `{ fall_probability, operating_threshold, is_fall }`.
- Trusted pilot/edge ingress `POST /api.alerts/events` accepts externally observed events and requires idempotency.

Backend already owns product alert policy, deduplication, webhook/Kakao dispatch, and persistence in `docs/architecture.md`. Moving those decisions into ML serving would make retry, idempotency, and credentials harder to audit.

## Decision

Use a backend-orchestrated production alert flow:

1. Backend calls FastAPI `/predict` and consumes only `{ fall_probability, operating_threshold, is_fall }`.
2. Backend applies alert policy, idempotency, persistence, and delivery orchestration.
3. `POST /api.alerts/events` remains a separate trusted pilot/edge ingress, guarded by `x-alert-api-key` and payload-level `external_event_id`.
4. Duplicate `(source_id, external_event_id)` requests return existing backend state and must not create a second delivery attempt or send a second Kakao message.

## Alternatives Considered

### ML/FastAPI pushes production alert events directly
- Pros: simple for camera/demo clients; fewer backend calls.
- Cons: moves product policy and external side-effect ownership into ML; splits audit and retry responsibility.
- Rejected: production alerts require backend-owned state and policy.

### Single generic alert endpoint for both `/predict` and edge events
- Pros: fewer API surfaces.
- Cons: conflates model signal with trusted event ingestion; weakens contract tests and auth semantics.
- Rejected: the trust models are different.

### Direct Kakao send without backend persistence
- Pros: fastest demo path.
- Cons: duplicate-send risk, no crash recovery, weak auditability.
- Rejected: structural hardening requires durable backend state.

## Consequences

- Backend has two explicit contracts to test: `/predict` consumption and `/api.alerts/events` ingress.
- ML serving remains thin and does not own alert semantics.
- Edge/demo clients must supply stable `external_event_id` values.
- This ADR complements ADR-003 and the reserved `/predict` contract ADRs; it does not expand `/predict` into event-level alert semantics.
