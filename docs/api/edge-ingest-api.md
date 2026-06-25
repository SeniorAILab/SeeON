# Edge Ingest API

Backend `/ingest/*` is the only canonical edge ingress. It accepts camera-authenticated facts and turns them into backend-owned read-model, status, SSE, and delivery outbox state.

Production live path: `RTSP -> ml-worker -> ml-api -> backend /ingest/*` (ADR-067/029).

`ml-api` signs backend requests per camera. Each camera has its own `camera_id`, `facility_id`, optional `resident_id`, `ingest_key_id`, and `ingest_secret`; `ml-worker` sends local relay facts with camera identity and does not store backend ingest credentials.

Current backend camera creation returns a one-time `ingestSecret` alongside the
camera's `ingestKeyId`. Store that secret in private `ml-api` edge configuration; list/get/update camera responses do not return it again.
Existing cameras whose one-time secret was lost must be recreated until a separate
rotation endpoint exists.

Backend ingest secrets are `ml-api` secrets. Worker camera/domain config and API gateway secret config must stay outside git and are mounted as edge deployment secrets.

## Authentication

Both endpoints use `HmacIngestGuard`.

Required headers:

| Header | Meaning |
|---|---|
| `X-Ingest-Key-Id` | Camera ingest key selector. Backend resolves the key through `get_camera_for_ingest(keyId)` and attaches the camera to the request. |
| `X-Ingest-Timestamp` | ISO-8601 or Unix milliseconds timestamp. Must be within the freshness window. |
| `X-Signature` | Hex HMAC-SHA256 over the canonical message. |

Freshness window: 5 minutes. Requests outside `±5 minutes` of server time fail with the stale timestamp domain error.

Signing key: `sha256(ingestSecret)`, which is stored as `Camera.ingestSecretHash`
and used directly by `HmacIngestGuard`.

## Canonical body

Canonical message:

```text
${resident_id}|${facility_id}|${type}|${detected_at}
```

Missing, null, or non-scalar values canonicalize to an empty string. For heartbeat, all body fields are absent, so the canonical message is:

```text
|||
```

## `POST /ingest/alerts`

### Request body

```json
{
  "resident_id": null,
  "facility_id": "facility_cuid",
  "probability": 0.97,
  "detected_at": "2026-06-18T12:00:00.000Z",
  "type": "fall",
  "snapshot_url": "ignored-if-present"
}
```

Required fields: `facility_id`, `probability`, `detected_at`, `type`.

Optional fields: `resident_id`. Unknown-person and room-centric alerts are valid, so
edge clients may send `null` or omit the field when the camera/space is not bound to a
specific resident.

Validation and ownership:

- `probability` must be a finite number in `[0, 1]`.
- `detected_at` must be valid ISO-8601 and within 5 minutes of server time.
- The authenticated camera's `facilityId` must equal `facility_id`.
- If the authenticated camera is assigned to a resident and `resident_id` is present, the
  values must match. If `resident_id` is absent or null, the backend stores a room-centric
  alert without updating a resident status row.
- `snapshot_url` is ignored. Backend never dereferences edge-provided URLs; snapshots are uploaded separately through the dashboard snapshot endpoint.

### Idempotency

Server-derived idempotency key:

```text
sha256(cameraId|detectedAt.toISOString()|type)
```

The backend owns the idempotency key; clients do not submit it.

Exact duplicate behavior:

- The first request creates the alert read-model and outbox rows.
- A duplicate unique-key collision is treated as idempotent success, not a second alert.
- On duplicate, backend fetches the existing alert and still calls outbox repair (`ensureOutboxForIngest`) so missing per-recipient delivery attempts are created without resending already non-pending attempts.

### Response

HTTP status is `201` for both created and duplicate paths in the target contract, matching the controller-level `@HttpCode(201)`.

```json
{
  "alertSeq": "42",
  "id": "alert_cuid",
  "status": "created"
}
```

For duplicates:

```json
{
  "alertSeq": "42",
  "id": "alert_cuid",
  "status": "duplicate"
}
```

### Backend effects

`/ingest/alerts` is responsible for one complete backend-owned alert transaction flow:

1. `AlertWriterService.writeAlert` persists `Alert`, updates `ResidentStatus`, and emits SSE alert/status frames.
2. `AlertEventsService.ensureOutboxForIngest` creates or repairs the `AlertEvent` and per-user `DeliveryAttempt` outbox rows.
3. Kakao dispatch is attempted only for pending attempts with real recipient tokens.

## `POST /ingest/heartbeat`

### Request body

No body is required. The same HMAC guard is used; sign the empty canonical message `|||`.

### Response

```json
{ "ok": true }
```

### Backend effects

- Updates `Camera.lastSeenAt` and `Camera.online` through `CamerasService.recordHeartbeat`.
- If the camera is assigned to a resident, updates `ResidentStatus.cameraOnline` through `StatusService.recordCameraHeartbeat`.
- Read-side camera-online decay remains backend-owned and is not an edge decision.
