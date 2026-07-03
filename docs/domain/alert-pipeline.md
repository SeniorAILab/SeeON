# Alert pipeline domain contract

The fall-alert pipeline is backend-owned and the delivered ingest path currently writes the dashboard alert/read concern only.

Notification/outbox tables may exist as backend delivery infrastructure, but `EventAlarmService.record()` does not create outbox rows or dispatch Kakao on `POST /api/v1/events`.

## Canonical ingress

`POST /api/v1/events` is the canonical ML event ingress.

- Controller: `backend/src/events/events.controller.ts`.
- Auth: no HMAC/session; backend resolves facility and space from `camera_id`.
- Event type: trim + lowercase at ingress, then require membership in the backend allowlist. Unknown types return `4xx`.
- ML signal: backend accepts the canonical ML event type and `confidence` as provided after normalization. It does not re-threshold probability for acceptance, and it does not apply cooldown or hourly-cap suppression at ingest.
- Tenant coherence: camera ownership determines facility/space; client-sent facility is not trusted.
- Idempotency: backend derives a key from camera id, detected timestamp, and normalized event type.
- Edge `snapshot_url` is ignored for SSRF safety; snapshots are server-owned uploads/keys.

The legacy pilot path is not a second domain ingress. Removed compatibility routes remain removed rather than being promoted.

## One idempotent event and the current ingest writes

A valid Event API request persists the Event SSOT. `EventAlarmService` then performs these downstream writes:

- `detection_lost`: `CamerasService.recordOffline()` marks the resolved camera offline/degraded and no red fall alert is written.
- Other allowed event types: `AlertWriterService.writeAlert()` writes one dashboard `Alert` linked by `originEventId`.

### Concern 1: dashboard alert read model

`AlertWriterService.writeAlert()` writes the `Alert` read-model row and emits the space-keyed dashboard frame after commit.

`Alert` is the dashboard-facing read model. It is facility-scoped/RLS-protected, aggregates by `spaceId`, and provides `alertSeq`, the SSE `Last-Event-ID` replay cursor. Relationship cardinality and room anchoring are canonicalized in [data-model.md](./data-model.md).

SSE emits exactly two normal named frames on `GET /api/v1/dashboard/stream`:

- `event: alert` for created alerts. It includes SSE `id: <alertSeq>` and payload fields `id`, `alertSeq`, `spaceId`, `cameraId`, `type`, `status`, `probability`, and `detectedAt`.
- `event: alert-updated` for lifecycle updates. It has no SSE `id:` line and includes `id`, `alertSeq`, `spaceId`, `status`, `resolvedById`, and `resolvedAt`.

Detection-lost/heartbeat absence means camera offline/degraded state. It is not a red fall alert.

### Resolve lifecycle

Resolve is a one-step audited mutation: `PATCH /api/v1/alerts/:id/resolve` marks the alert resolved by the current user, sets `resolvedById` and `resolvedAt`, returns the updated alert, and emits `event: alert-updated`.

### Notification/outbox state

The current Event API ingest path does not call `AlertEventsService.ensureOutboxForIngest()`, does not create `AlertEvent` rows, does not upsert `DeliveryAttempt` rows, and does not dispatch Kakao. Any future outbox repair or fan-out path must be documented as separate from the delivered `EventAlarmService` side effects.

## Alert vs delivery outbox

`Alert` is the delivered dashboard read model for Event API ingest. Delivery outbox tables are separate backend infrastructure, not a required side effect of ingest in the current source:

| Table | Concern | External surface | Idempotency/order key |
|---|---|---|---|
| `Alert` | Dashboard read model + SSE | `/api/v1/alerts`, `/api/v1/dashboard/stream` | `idempotencyKey`, `alertSeq` |
| `AlertEvent` | Backend delivery/outbox audit | internal service/repository | `(sourceId, externalEventId)` |
| `DeliveryAttempt` | Per-channel/per-recipient delivery record | internal service/repository | `(alertEventId, recipientUserId)` |

## Kakao fan-out

Kakao self-notification is backend-owned delivery policy, but it is not triggered by the current Event API ingest path. The Kakao adapter may report sent, transient failure, or terminal operator-action failure when a delivery path explicitly invokes it; it must never fake success.

## ML signal contract

The old backend-pull prediction contract is retired, not a second alert ingress. Live ML classification happens in `ml-worker`; its confidence is relayed through `ml-api` and enters backend `POST /api/v1/events` as `confidence`.

Backend owns alert policy, persistence, deduplication, SSE, and any delivery path. ML output must enter the same canonical `POST /api/v1/events` ingress and must not add a second alert ingress.
