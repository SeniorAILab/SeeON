# ADR-043: Canonical ingest single ingress for alert read-model and outbox

## Status
Accepted

## Date
2026-06-17

## Context

The backend previously had two alert planes that could diverge during a real fall:

- ADR-034 covers the RLS `Alert` read-model and SSE dashboard stream.
- ADR-035 and ADR-037 cover backend-owned alert orchestration and the `AlertEvent` / `DeliveryAttempt` outbox.

When those planes are fed by separate API paths, one fall can update the dashboard without producing Kakao delivery attempts, or enqueue delivery without updating the realtime read-model. The Thursday MVP requires one live fall from the ML demo to produce both visible dashboard state and durable per-recipient delivery work.

This ADR extends ADR-035 and ADR-037 by making `/ingest/alerts` the canonical ingress that creates both records for the same idempotent event.

## Decision

Treat `POST /ingest/alerts` as the single canonical backend ingress for ML-originated fall alerts.

For each valid ingest request:

1. Compute `external_event_id` from the existing ingest idempotency key, `sha256(camera.id|detectedAt|type)`.
2. Call the alert writer path to create or reuse the RLS `Alert` read-model and emit the SSE update.
3. Call `ensureOutboxForIngest` for the same event to upsert `AlertEvent` and per-recipient `DeliveryAttempt` rows.
4. Ensure or repair the outbox on both first-created and duplicate ingest requests.
5. Commit `AlertEvent` and all recipient `DeliveryAttempt` rows before any provider send is attempted.
6. Return a retryable 5xx if outbox pre-persistence fails after the read-model is written, so ML retry can repair the missing outbox.
7. On duplicate repair, send only `PENDING` delivery attempts; do not re-send already terminal or sent attempts.

The legacy `POST /api.alerts/events` path remains as a pilot endpoint while the MVP path moves to `/ingest/alerts`. It is not the canonical live-demo ingress.

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

- `/ingest/alerts` becomes the authoritative live fall ingestion contract for the MVP.
- Read-model/SSE and outbox state are tied to one idempotency key.
- Duplicate ingest requests are useful repair attempts, not silent no-ops that can leave missing outbox state.
- The ingest transaction boundary must protect provider sends from happening before durable `PENDING` attempts exist.
- `api.alerts/events` remains temporary pilot surface area and should be cleaned up or explicitly repositioned after the MVP.
