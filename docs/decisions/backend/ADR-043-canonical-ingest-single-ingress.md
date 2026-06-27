# ADR-043: Canonical ingest single ingress for alert read-model and outbox

## Status
Accepted; pilot endpoint superseded by ADR-047

## Date
2026-06-17

## Context

The backend previously had two alert planes that could diverge during a real fall:

- ADR-034 covers the RLS `Alert` read-model and SSE dashboard stream.
- ADR-035 and ADR-037 cover backend-owned alert orchestration and the `AlertEvent` / `DeliveryAttempt` outbox.

When those planes are fed by separate API paths, one fall can update the dashboard without producing Kakao delivery attempts, or enqueue delivery without updating the realtime read-model. The Thursday MVP requires one live fall from the ML demo to produce both visible dashboard state and durable per-recipient delivery work.

Supersession note: this historical HMAC ingest ADR is superseded for live traffic by the issue #388 Event API cutover. Live ML ingress is `POST /api/v1/events`, with backend policy deriving alerts/outbox from the Event SSOT.

## Decision

Historical decision: treat the HMAC alert route as the single backend ingress for ML-originated fall alerts during that phase.

For each valid ingest request:

1. Compute `external_event_id` from the existing ingest idempotency key, `sha256(camera.id|detectedAt|type)`.
2. Call the alert writer path to create or reuse the RLS `Alert` read-model and emit the SSE update.
3. Call `ensureOutboxForIngest` for the same event to upsert `AlertEvent` and per-recipient `DeliveryAttempt` rows.
4. Ensure or repair the outbox on both first-created and duplicate ingest requests.
5. Commit `AlertEvent` and all recipient `DeliveryAttempt` rows before any provider send is attempted.
6. Return a retryable 5xx if outbox pre-persistence fails after the read-model is written, so ML retry can repair the missing outbox.
7. On duplicate repair, send only `PENDING` delivery attempts; do not re-send already terminal or sent attempts.

The legacy `POST /api.alerts/events` pilot-endpoint retention clause was superseded by ADR-047. The later Event API cutover supersedes this HMAC route for live ML ingress.

## Alternatives Considered

### Keep two APIs and require manual double-submit

- Pros: avoids changing either existing path immediately.
- Cons: makes consistency depend on every caller remembering to POST twice, with independent idempotency and failure handling.
- Rejected: the live fall path needs one source of truth and retry semantics.

### Have the demo POST once to the read-model API and once to the outbox API

- Pros: isolates orchestration in the demo client.
- Cons: pushes backend consistency, retry repair, and ordering rules into ML/demo code.
- Rejected: backend owns alert policy, persistence, and side effects under ADR-035.

## Consequences

- Historical: the HMAC route was the authoritative fall ingestion contract for the MVP; live ML ingress is now the Event API.
- Read-model/SSE and outbox state are tied to one idempotency key.
- Duplicate ingest requests are useful repair attempts, not silent no-ops that can leave missing outbox state.
- The ingest transaction boundary must protect provider sends from happening before durable `PENDING` attempts exist.
- The temporary `api.alerts/events` pilot surface area was removed from the live contract by ADR-047; the later Event API cutover supersedes the HMAC route for live ML ingress.
