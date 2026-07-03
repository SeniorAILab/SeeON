# Edge Event API

Backend Event API is the canonical ML-to-backend ingress. It accepts no-HMAC event facts from `ml-api`, resolves facility/space ownership from `camera_id`, and turns events into backend-owned `Event` rows plus camera state and alert read-model state.

Production live path: `RTSP -> ml-worker -> ml-api -> backend /api/v1/events` (ADR).

`ml-worker` relays local facts to `ml-api` at `/api/v1/relay/*`. `ml-api` posts backend events through the single `API_BACKEND_EVENTS_URL` setting. Camera HMAC credentials and `Camera.ingestMode` are removed; cameras are identified by `camera_id`, and backend resolves the trusted facility/space from that camera.

## Authentication

The Event API has no request HMAC and no session cookie. The backend trusts only the camera record resolved from `camera_id`; any client-supplied facility value is ignored. Network exposure and edge-to-host transport controls are deployment concerns, not per-camera signing headers.

## `POST /api/v1/events`

### Request body

```json
{
  "camera_id": "camera_cuid",
  "type": "fall",
  "detected_at": "2026-06-18T12:00:00.000Z",
  "confidence": 0.97
}
```

Required fields: `camera_id`, `type`, `detected_at`.

Optional fields: `confidence`.

Validation and ownership:

- `camera_id` must resolve to an existing backend camera. Unknown cameras return `404`.
- The resolved camera determines `facilityId` and `spaceId`; event clients do not choose facility tenancy.
- `detected_at` must be valid ISO-8601.
- `confidence`, when present, must be a finite number in `[0, 1]`.

### Idempotency

Server-derived deduplication key:

```text
sha256(cameraId|detectedAt.toISOString()|type)
```

The backend owns the key; clients do not submit it. Exact duplicates return the existing event with `status: "duplicate"`.

### Response

HTTP status is `201` for both created and duplicate paths.

```json
{
  "id": "event_cuid",
  "status": "created"
}
```

For duplicates:

```json
{
  "id": "event_cuid",
  "status": "duplicate"
}
```

### Backend effects

`POST /api/v1/events` persists the immutable `Event` SSOT. `EventAlarmService` then marks cameras offline for `detection_lost`; otherwise it writes an `Alert` linked by `Alert.originEventId`. Current ingest does not create `AlertEvent` outbox rows, `DeliveryAttempt` rows, or Kakao sends.

## `POST /api/v1/events/heartbeat`

### Request body

```json
{
  "camera_id": "camera_cuid"
}
```

### Response

```json
{ "ok": true }
```

### Backend effects

- Updates `Camera.lastSeenAt` and `Camera.online` through `CamerasService.recordHeartbeat`.
- The resolved camera determines facility ownership.
- Read-side camera-online decay remains backend-owned and is not an edge decision.
