# API and Event Contracts

`docs/api/` is the single owner for current front↔backend↔ML HTTP API and realtime event contracts.

This directory documents the target contract for issue #216. Code must be refactored to match these files, not the other way around. When implementation is still in transition, the contract page marks the gap as `Target; not yet in code`.

## Contract index

- [Route inventory](./route-inventory.md) — all target backend dashboard/auth/ingest routes plus removed routes.
- [Edge ingest API](./edge-ingest-api.md) — HMAC camera ingest for alerts and heartbeat.
- [Dashboard API](./dashboard-api.md) — authenticated dashboard read-model and CRUD APIs.
- [ML serving API](./ml-serving-api.md) — FastAPI `/predict` window contract and `/health`.
- [Realtime events](./realtime-events.md) — dashboard SSE stream frame contract.
- [Kakao delivery API](./kakao-delivery-api.md) — outbox, delivery attempts, and Kakao send-to-me semantics.

## Ownership rule

API/event changes are made in this order:

1. Update the relevant `docs/api/*` page with the new contract.
2. Update or add the relevant ADR under `docs/decisions/{backend,frontend,ml,common}/` when the change is expensive to reverse or changes ownership boundaries.
3. Refactor backend, frontend, ML serving, tests, and migrations to match the documented contract.

Do not create a root `contracts/` directory. Contract ownership stays under `docs/api/`, with ADRs explaining durable decisions.

## Layer ownership

- Edge devices submit camera-authenticated facts to backend `/ingest/*`.
- Backend owns alert policy, persistence, deduplication, dashboard read-models, SSE, outbox creation, and Kakao delivery state.
- ML serving owns classification only: it converts a pose window into a fall probability and boolean classification.
- Frontend consumes backend dashboard/auth routes; it does not call ML serving directly.

## Transitional notation

- `Target; already in code` means current implementation already serves the contract.
- `Target; not yet in code` means this is the approved post-refactor contract and current implementation still differs.
- Removed routes are listed explicitly in [route-inventory.md](./route-inventory.md) and must not be kept as aliases unless a later ADR changes this contract.
