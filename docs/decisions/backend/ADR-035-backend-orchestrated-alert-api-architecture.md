# ADR-035: Backend-orchestrated alert API architecture

## Status
Accepted; `/api.alerts/events` ingress superseded by ADR-047

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

Supersession note: ADR-047 supersedes this separate `/api.alerts/events` ingress clause. `/ingest/alerts` is the only live backend alert ingress; this ADR remains active for backend-owned alert policy, idempotency, persistence, and dispatch ownership.

Route note: the ML serving prediction route is now `POST /debug/predict/window` (ADR-048, ml/ edge-device relayout issue #268); the bare `/predict` references throughout this ADR are historical naming for that same model-signal contract. The backend prediction seam stays dormant on the edge-push topology (ADR-029).
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

- Backend has two explicit contracts to test in this original decision: `/predict` consumption and `/api.alerts/events` ingress. ADR-047 supersedes the separate `/api.alerts/events` ingress; the current live alert ingress is only `/ingest/alerts`.
- ML serving remains thin and does not own alert semantics.
- Edge/demo clients must supply stable `external_event_id` values.
- This ADR complements ADR-022 (ML serving/training lifecycle) and ADR-023 (ML↔backend `/predict` prediction boundary); it does not expand `/predict` into event-level alert semantics.
