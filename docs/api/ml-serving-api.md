# ML Serving API

`ml-api` is a FastAPI service for private/local edge health, status, relay, and bounded operator-control surfaces. It is a pure relay/status/backend-gateway process: it does **not** expose prediction routes, does **not** load ML models, and does **not** run classification. Classification happens in `ml-worker`; the worker relays facts to `ml-api`, and `ml-api` forwards backend Event API requests.

Production live path: `RTSP -> ml-worker probability -> ml-api /api/v1/relay/* -> backend /api/v1/events confidence` (ADR-067/029). Backend owns alert policy, persistence, deduplication, delivery, and dashboard history (ADR-023). The retired backend-pull `/debug/predict/*` seam from ADR-048 is not part of the live path and has been removed.

Production camera ownership is not part of the API process. The edge node runs `ml-api` for unversioned health probes plus `/api/v1` status/models/relay routes. It runs `ml-worker` for long-running RTSP capture, model/domain evaluation, heartbeat facts, and alert fact creation (ADR-067/ADR-068). The API service does not own live camera streams, raw frame relay, model loading, or prediction.

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

Runtime status snapshot. This is operational state for the edge API relay process, not an alert-history API. Backend remains the owner of persisted alert/dashboard state. Production camera workers run out-of-process and relay heartbeat/alert facts to `ml-api`, which publishes backend Event API requests to `API_BACKEND_EVENTS_URL` per ADR-067/029.

## `GET /api/v1/models`

Gateway metadata snapshot. Returns API-visible metadata such as service role, relay/backend configuration status, and static contract information. It is not a model registry, does not enumerate runtime tasks, does not include a device descriptor, and does not imply model loading in `ml-api`.

Example shape:

```json
{
  "service": "ml-api",
  "role": "gateway",
  "prediction_routes": false,
  "model_loading": false
}
```

## Relay routes

`ml-api` accepts worker relay requests under `/api/v1/relay/*` and forwards Event API payloads to backend. Alert relays carry the worker-produced probability as backend Event API `confidence`. `ml-api` validates relay auth and camera inventory but does not recompute or reinterpret classification.
