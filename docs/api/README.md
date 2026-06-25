# API and Event Contracts

`docs/api/` is the single owner for the **current** front↔backend↔ML HTTP API and realtime event contracts.

These pages describe the contract **as implemented** (issue #216 / PR #217 plus the facility rename and placement route follow-ups): the code matches these files, not the other way around. Future API/event changes update these pages (and the relevant ADR) first, then the code.

## Contract index

- [Route inventory](./route-inventory.md) — all backend dashboard/auth/ingest routes plus explicitly removed routes.
- [Edge ingest API](./edge-ingest-api.md) — HMAC camera ingest for alerts and heartbeat.
- [Dashboard API](./dashboard-api.md) — authenticated Vite + React dashboard read-model and CRUD APIs.
- [ML API](./ml-serving-api.md) — FastAPI `/debug/predict/window` canonical window contract, `/debug/predict/source` debug/source mode, `/health/live`, `/health/ready`, `/status`, and `/models`. Bare `POST /predict` is removed.
- [Realtime events](./realtime-events.md) — dashboard SSE stream frame contract.
- [Kakao delivery API](./kakao-delivery-api.md) — outbox, delivery attempts, and Kakao send-to-me semantics.

## Ownership rule

API/event changes are made in this order:

1. Update the relevant `docs/api/*` page with the new contract.
2. Update or add the relevant ADR under `docs/decisions/{backend,frontend,ml,common}/` when the change is expensive to reverse or changes ownership boundaries.
3. Refactor backend, frontend, ML API, tests, and migrations to match the documented contract.

Do not create a root `contracts/` directory. Contract ownership stays under `docs/api/`, with ADRs explaining durable decisions.

## Layer ownership

- Edge devices submit camera-authenticated facts to backend `/ingest/*`.
- Backend owns alert policy, persistence, deduplication, dashboard read-models, SSE, outbox creation, and Kakao delivery state.
- ML API owns classification only: it converts a pose window into a fall probability and boolean classification.
- Frontend consumes backend dashboard/auth routes; it does not call ML API directly.

## Removed routes

Removed routes are listed explicitly in [route-inventory.md](./route-inventory.md) and MUST NOT be kept as compatibility aliases unless a later ADR changes this contract: `POST /api.alerts/events` (→ `/ingest/alerts`, ADR-047), `POST /orgs` (→ `/api/facilities`), `POST /api/orgs` (→ `/api/facilities`), `GET/PUT /api/snapshots/:alertId` (→ `/api/alerts/:alertId/snapshot`), `GET /sse` and `GET /auth/me` (session probes folded into `/auth/session`), and ML API `POST /predict` (→ `POST /debug/predict/window` for canonical window inference or `POST /debug/predict/source` for bounded debug/source inference).
