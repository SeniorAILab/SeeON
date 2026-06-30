# API and Event Contracts

`docs/api/` is the single owner for the **current** front↔backend↔ML HTTP API and realtime event contracts.

These pages describe the contract **as implemented** (issue #216 / PR #217 plus the facility rename and placement route follow-ups): the code matches these files, not the other way around. Future API/event changes update these pages (and the relevant decision) first, then the code.

## Contract index

- [Route inventory](./route-inventory.md) — all backend dashboard/auth/Event API routes plus explicitly removed routes.
- [Edge Event API](./edge-ingest-api.md) — no-HMAC `POST /api/v1/events` and `POST /api/v1/events/heartbeat`.
- [Dashboard API](./dashboard-api.md) — authenticated Vite + React dashboard read-model and CRUD APIs.
- [ML API](./ml-serving-api.md) — ML-free FastAPI gateway for `/health/live`, `/health/ready`, `/status`, `/models` metadata, and `/api/v1/relay/*`. Prediction routes including `POST /predict` and `/debug/predict/*` are removed.
- [Realtime events](./realtime-events.md) — dashboard SSE stream frame contract.
- [Kakao delivery API](./kakao-delivery-api.md) — outbox, delivery attempts, and Kakao send-to-me semantics.

## Ownership rule

API/event changes are made in this order:

1. Update the relevant `docs/api/*` page with the new contract.
2. Update or add the relevant decision under `docs/decisions/{backend,frontend,ml,common}/` when the change is expensive to reverse or changes ownership boundaries.
3. Refactor backend, frontend, ML API, tests, and migrations to match the documented contract.

Do not create a root `contracts/` directory. Contract ownership stays under `docs/api/`, with decisions explaining ADRs.

## Layer ownership

- Edge `ml-api` submits no-HMAC facts to backend `POST /api/v1/events` and `POST /api/v1/events/heartbeat` using `API_BACKEND_EVENTS_URL`; backend resolves facility/space from `camera_id`.
- Backend owns alert policy, persistence, deduplication, dashboard read-models, SSE, outbox creation, and Kakao delivery state.
- ML API owns debug classification and the worker relay gateway: product routes are under `/api/v1`, probes stay `/health/live` and `/health/ready`, and worker relay paths are `/api/v1/relay/*`.
- Frontend consumes backend dashboard/auth routes; it does not call ML API directly.

## Removed routes

Removed routes are listed explicitly in [route-inventory.md](./route-inventory.md) and MUST NOT be kept as compatibility aliases unless a later decision changes this contract: `POST /api.alerts/events`, old machine-ingest alert/heartbeat routes, `POST /orgs` (→ `/api/v1/facilities`), `POST /api/orgs` (→ `/api/v1/facilities`), `GET/PUT /api/snapshots/:alertId` (→ `/api/v1/alerts/:alertId/snapshot`), `GET /sse` and `GET /auth/me` (session probes folded into `/auth/session`), `GET/PATCH /api/v1/detection-events`, `GET/POST/PATCH/DELETE /api/v1/alert-rules` (removed skeletons now return `404`), and ML API prediction routes `POST /predict` plus `POST /debug/predict/{window,source}` (removed; live classification is worker-produced and relayed as Event API `confidence`).
