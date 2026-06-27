# Alert pipeline domain contract

The fall-alert pipeline is one domain with two write concerns:

1. Dashboard read state.
2. Notification/outbox delivery state.

Those concerns are stored separately, but they are not separate domains and they must not create separate live ingresses.

## Canonical ingress

`POST /api/v1/events` is the canonical ML event ingress.

- Controller: `backend/src/events/events.controller.ts`.
- Auth: no HMAC/session; backend resolves facility/space from `camera_id`.
- Tenant coherence: camera facility must match payload `facility_id`; target relationships and FK directions are canonicalized in [data-model.md](./data-model.md).
- Idempotency: backend derives a key from camera id, detected timestamp, and event type.
- Edge `snapshot_url` is ignored for SSRF safety; snapshots are server-owned uploads/keys.

The legacy `/api.alerts/events` pilot path is not a second domain ingress. It exists only as refactor debt and must be removed rather than promoted.

## One idempotent event, two write concerns

A valid Event API request persists the Event SSOT, and backend alert policy performs the downstream alert write concerns for eligible events.

### Concern 1: dashboard read model

`AlertWriterService.writeAlert()` writes:

- `Alert` read-model row.
- `ResidentStatus` current state (`NORMAL`, `WARNING`, or `FALL`) derived from probability thresholds.
- SSE emissions after commit: unnamed alert event and named `event: status` update.

`Alert` is the dashboard-facing read model. It is facility-scoped/RLS-protected and provides `alertSeq`, the SSE `Last-Event-ID` replay cursor. Relationship cardinality and room anchoring are canonicalized in [data-model.md](./data-model.md).

### Concern 2: notification outbox

`AlertEventsService.ensureOutboxForIngest()` writes/repairs:

- `AlertEvent` outbox row keyed by `(sourceId, externalEventId)`.
- One `DeliveryAttempt` per Kakao recipient in the facility.
- Kakao send-to-me fan-out for pending attempts only.

`AlertEvent` and `DeliveryAttempt` are backend-owned outbox tables, not tenant list/read models. They are non-RLS because they are delivery infrastructure keyed by ingest source and external event id.

## Alert vs AlertEvent

`Alert` and `AlertEvent` are the same alert domain, separated by write concern:

| Table | Concern | External surface | Idempotency/order key |
|---|---|---|---|
| `Alert` | Dashboard read model + SSE | `/api/alerts`, `/api/sse` | `idempotencyKey`, `alertSeq` |
| `AlertEvent` | Backend delivery/outbox audit | internal service/repository | `(sourceId, externalEventId)` |
| `DeliveryAttempt` | Per-channel/per-recipient delivery record | internal service/repository | `(alertEventId, recipientUserId)` |

Do not model these as two separate alert domains. A live ingest that updates only `Alert` without `AlertEvent`, or only `AlertEvent` without `Alert`, is incomplete unless a documented repair/migration is intentionally running.

## Kakao fan-out

Kakao self-notification is backend-owned delivery policy. The ingest path calls `ensureOutboxForIngest`, which finds Kakao recipients for the facility and dispatches one send-to-me attempt per recipient. The Kakao adapter may report sent, transient failure, or terminal operator-action failure; it must never fake success.

## ML prediction contract

The ML prediction contract is a future backend-prediction path, not a second alert ingress.

- Port: `backend/src/alerts/ports/prediction.port.ts`.
- Adapter: `backend/src/alerts/adapters/ml-serving-prediction.adapter.ts`.
- DTO contract: request `{ "window": ... }`, response `{ "fall_probability": number, "operating_threshold": number, "is_fall": boolean }`.

ML predicts fall probability/classification. Backend owns alert policy, persistence, deduplication, SSE, and delivery. When backend-driven prediction becomes live, its output must still enter the same one-domain pipeline and produce the same two write concerns. It must not add a second alert ingress beside `POST /api/v1/events`.
