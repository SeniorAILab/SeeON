# Edge Event API

Backend Event API is the canonical ML-to-backend ingress. It accepts no-HMAC event facts from `ml-api`, resolves facility/space ownership from `camera_id`, and turns events into backend-owned `Event` rows plus camera state and alert read-model state.

Production live path: `RTSP -> ml-worker -> ml-api -> backend /api/v1/events` (ADR).

`ml-worker` relays local facts to `ml-api` at `/api/v1/relay/*`. `ml-api` posts backend events through the single `API_BACKEND_EVENTS_URL` setting. Camera HMAC credentials and `Camera.ingestMode` are removed; cameras are identified by `camera_id`, and backend resolves the trusted facility/space from that camera.
The relay remains a private edge-LAN contract authenticated by `X-Edge-Relay-Token`. Phase-1 deliberately keeps this network-trust model for worker↔ml-api and ml-api↔backend; Phase-2 hardening is the place for dedicated config-service auth and RTSP-at-rest encryption.

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

Optional fields: `confidence`, `config_version`, `model_version`, `detector_version`, `operating_threshold`, `clock_source`. Client-supplied `snapshot_key` is ignored; snapshots are uploaded after Event creation through the server-derived snapshot route.

Validation and ownership:

- `camera_id` must resolve to an existing backend camera. Unknown cameras return `404`.
- The resolved camera determines `facilityId` and `spaceId`; event clients do not choose facility tenancy.
- `detected_at` must be a non-empty Date-parseable timestamp.
- `confidence`, when present, must be a finite number.

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

## `PUT /api/v1/events/:eventId/snapshot`

`ml-api` uploads raw snapshot bytes only after `POST /api/v1/events` has created or resolved the Event. The backend derives the storage key from the resolved Event as `<facilityId>/<eventId>.<ext>`, rejects client-supplied key material, enforces the raw-body 2 MiB limit, persists `Event.snapshotKey`, and backfills the derived Alert snapshot key. Snapshot upload is best-effort from the relay point of view; event ingestion is the durable first step.

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

## Worker relay routes on `ml-api`

### `POST /api/v1/relay/alerts`

Worker alert relays keep the existing `X-Edge-Relay-Token` authentication and `extra="forbid"` validation. The prior envelope-less shape is still accepted:

```json
{
  "event_type": "fall",
  "probability": 0.97,
  "detected_at": "2026-06-18T12:00:00.000Z",
  "camera_id": "camera_cuid",
  "facility_id": "facility_cuid"
}
```

Relay validation requires non-empty `detected_at` and `probability` in `[0, 1]`; `ml-api` forwards `probability` to backend `POST /api/v1/events` as `confidence`, where the backend only requires a finite number.

Additive optional fields:

```json
{
  "audit": {
    "config_version": 7,
    "model_version": "rf-nh-2026-07-04",
    "detector_version": "edge-detector-1.2.3",
    "operating_threshold": 0.42,
    "clock_source": "edge_wall_clock"
  },
  "snapshot_jpeg_base64": "/9j/..."
}
```

`ml-api` forwards the audit envelope to backend `POST /api/v1/events`. When `snapshot_jpeg_base64` is present and valid base64, `ml-api` decodes it and performs the Event-created-first snapshot upload to backend `PUT /api/v1/events/:eventId/snapshot`.

### `POST /api/v1/relay/heartbeat`

Heartbeat relays keep the existing token-authenticated shape and accept optional `config_version`:

```json
{
  "camera_id": "camera_cuid",
  "facility_id": "facility_cuid",
  "config_version": 7
}
```

`ml-api` records the heartbeat locally for `/api/v1/status`, including the optional `config_version`, then forwards the heartbeat to backend `POST /api/v1/events/heartbeat`.

### `GET /api/v1/relay/config`

Token-authenticated worker config read. `ml-api` re-pulls backend `GET /api/v1/ml-config/:facilityId` best-effort for every request so live backend camera/night-window changes can reach the worker without restarting `ml-api`; the last-good pulled config is preserved when the backend pull fails. If `ml-api` has no backend config at all, the route returns `503`.

Response shape is the worker-facing `PulledWorkerConfig`:

```json
{
  "config_version": 7,
  "restart_epoch": 0,
  "night_window": {
    "start": "21:00",
    "end": "06:00",
    "tz": "Asia/Seoul"
  },
  "cameras": [
    {
      "camera_id": "camera_cuid",
      "space_id": "space_cuid",
      "label": "Room 301",
      "rtsp_url": "rtsp://user:pass@camera/stream",
      "online": true
    }
  ]
}
```

### `POST /api/v1/relay/restart`

Token-authenticated Plane-O reboot directive. The request body is empty. `ml-api` increments `restart_epoch` and returns:

```json
{
  "restart_epoch": 1
}
```

`ml-worker` polls config, observes a `restart_epoch` increase over its boot value, clean-exits with status `0`, and relies on Compose `restart: unless-stopped` to relaunch with the current pulled/LKG config.
