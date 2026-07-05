# ML Serving API

`ml-api` is a FastAPI service for private/local edge health, status, relay, worker config, restart, and bounded operator-control surfaces. It is a backend-facing gateway process: it does **not** expose prediction routes, does **not** load ML models, and does **not** run classification. Classification happens in `ml-worker`; the worker relays facts to `ml-api`, and `ml-api` is the only edge process that reaches the backend.

Production live path: `RTSP -> ml-worker probability -> ml-api /api/v1/relay/* -> backend /api/v1/events confidence` (ADR). Backend owns alert policy, persistence, deduplication, delivery, dashboard history, and ML config SSOT. `ml-api` pulls backend config from `GET /api/v1/ml-config/:facilityId` at boot and per worker `/api/v1/relay/config` request; it never waits for backend push. The retired backend-pull `/debug/predict/*` seam from ADR is not part of the live path and has been removed.

Production camera ownership is not part of the API process. The edge node runs `ml-api` for unversioned health probes plus `/api/v1` status/models/relay routes. It runs `ml-worker` for long-running RTSP capture, model/domain evaluation, heartbeat facts, alert fact creation, LKG config persistence, and clean restart on `restart_epoch` increases (ADR). The API service does not own live camera streams, raw frame relay, model loading, or prediction.

## `GET /health/live`

Liveness probe. Returns `200` with:

```json
{ "status": "ok" }
```

## `GET /health/ready`

Readiness probe. Returns the API service readiness snapshot from app state. When the service is still booting or unavailable, the same body is returned with HTTP `503`; ready services return HTTP `200`. Camera stream health and model readiness are worker concerns and do not block API liveness.

## `GET /health`

Legacy aggregate health report for local/demo observability. It reports API process status and backend relay readiness; it does not report loaded model state because `ml-api` does not load models.

## `GET /api/v1/status`

Runtime status snapshot. This is operational state for the edge API relay process, not an alert-history API. Backend remains the owner of persisted alert/dashboard state. Production camera workers run out-of-process and relay heartbeat/alert facts to `ml-api`, which publishes backend Event API requests to `API_BACKEND_EVENTS_URL` per ADR.

## `GET /api/v1/models`

Gateway metadata snapshot. Returns API-visible metadata such as service role, relay/backend configuration status, and static contract information. It is not a model registry, does not enumerate runtime tasks, does not include a device descriptor, and does not imply model loading in `ml-api`.

Example shape:

```json
{
  "service": "ml-api",
  "role": "gateway",
  "ml": "external-worker",
  "relay": {
    "backend_configured": true,
    "camera_count": 4
  }
}
```

## Backend config gateway

`ml-api` is now a config gateway, not a dumb relay. It uses `API_BACKEND_CONFIG_URL` plus `API_FACILITY_ID` as the primary source for backend `GET /api/v1/ml-config/:facilityId`, pulls once at boot, and re-pulls best-effort on every worker `GET /api/v1/relay/config` request. `API_CAMERA_INVENTORY` is demoted to fallback/bootstrap inventory when the backend config pull is unavailable; it is no longer the primary production source.

A successful backend config pull seeds `ml-api`'s camera binding table from backend-owned camera rows, including `rtspUrl` for the worker-facing config response. Pull failures preserve the last-good config in process; when no backend-pulled config exists, worker config requests return `503` so the worker can keep its own LKG/YAML precedence.

`ml-api` exposes two worker-facing control/config routes under the existing relay-token trust model:

- `GET /api/v1/relay/config` returns `{ config_version, restart_epoch, night_window, cameras }` and re-pulls backend config best-effort before responding.
- `POST /api/v1/relay/restart` bumps `restart_epoch` and returns `202 { restart_epoch }`; the worker observes the increase, clean-exits, and Compose restarts it.

The gateway also forwards the optional alert `audit` envelope to backend `POST /api/v1/events` and performs Event-created-first snapshot upload: backend Event first, then relay-carried `snapshot_jpeg_base64` bytes to backend `PUT /api/v1/events/:eventId/snapshot`. This preserves one-way edge egress: worker talks only to `ml-api`; `ml-api` is the only process reaching the backend; backend never calls into `ml-api` or the worker.

## Relay routes

`ml-api` accepts worker relay requests under `/api/v1/relay/*` and forwards Event API payloads to backend. Alert relays carry the worker-produced probability as backend Event API `confidence`, may include an optional `audit` envelope and `snapshot_jpeg_base64`, and preserve Pydantic `extra="forbid"` validation. Heartbeat relays may include `config_version`, which is surfaced in `/api/v1/status`. `ml-api` validates relay auth and camera binding but does not recompute or reinterpret classification.
