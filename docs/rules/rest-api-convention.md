# REST API convention

This repo keeps product HTTP routes under `/api/v1/*`. Do not add another product namespace without a decision.

## Namespaces

- `/api/v1/*` is the product API used by the dashboard and other authenticated product clients.
  - Current examples: `POST /api/v1/auth/login`, `GET /api/v1/auth/kakao/login`, `GET /api/v1/auth/me`, `GET /api/v1/alerts`, `PATCH /api/v1/alerts/:id/ack`, `GET /api/v1/cameras`, `GET /api/v1/dashboard/stream`, `GET`/`PATCH /api/v1/facilities/current`, `POST /api/v1/facilities`, and the placement resources `GET`/`POST`/`PATCH`/`DELETE /api/v1/floors` and `/api/v1/spaces`.
  - Product `/api/v1/*` responses are **camelCase** (matching `front/src/types/index.ts`), emitted via response DTO/presenter mappers — never raw Prisma models. snake_case JSON is used only for source-oriented Event API inputs, ML prediction inputs, and alert outbox DTOs — see `docs/rules/dto-convention.md`.
- ML Event API ingress is under `/api/v1/events` and is no-HMAC.
  - Current canonical routes: `POST /api/v1/events` and `POST /api/v1/events/heartbeat` in `backend/src/events/events.controller.ts`.

## Path shape

- No dotted path segments. `/api.alerts/events` is banned; it came from the legacy pilot controller and must not be reintroduced.
- Use plural nouns for collections: `/api/v1/alerts`, `/api/v1/cameras`, `/api/v1/facilities`, `/api/v1/floors`, `/api/v1/spaces`.
- Use nested singleton sub-resources when the resource exists only in the context of a parent.
  - Snapshot canonical path: `/api/v1/alerts/:id/snapshot`.
  - Facility singleton: `GET`/`PATCH /api/v1/facilities/current` (the session's facility; never addressed by id from the client).
  - Do not add new top-level snapshot paths such as `/api/v1/snapshots/:alertId`.
- Use verbs only when the operation is not naturally represented as a resource state update. The existing `/api/v1/alerts/:id/ack` mutation is accepted as the dashboard acknowledgement action; new status transitions should prefer resource-oriented naming unless there is a concrete reason.

## Status codes

- `201 Created` for creation or first accepted creation-like event ingestion.
  - `POST /api/v1/events` returns `201` for a newly created event.
  - Snapshot upload may return `201` when it stores a new snapshot object.
- `200 OK` for mutations that return a body or idempotent duplicate responses.
  - `PATCH /api/v1/alerts/:id/ack` returns the updated alert.
  - Duplicate `POST /api/v1/events` returns a body with duplicate status instead of pretending a second event was created.
- `204 No Content` for logout or delete-like operations that intentionally return no body.
  - `POST /api/v1/auth/logout` is the reference.
- DELETE semantics for product resources: `204` for a hard delete, `200` with a body for a soft delete (e.g. `isActive=false`), and `409` when the resource is still referenced (e.g. a floor with active child spaces).

## Error shape

HTTP errors exposed to clients use a stable JSON shape:

```json
{ "error": "string-code-or-class", "message": "human readable detail" }
```

Controllers and exception filters may include framework status metadata, but clients may only depend on `error` and `message`. Do not invent per-route error envelopes.

## Atomic front + backend rename rule

A path rename must update backend routes, frontend service callers (`front/src/services/*`), the dev-server proxy config, tests, and docs in one change set. Never leave an intermediate state where the frontend calls a path the backend does not serve, or the backend only serves a path no frontend/test still exercises.

Concrete refactor history:

- Legacy `POST /api/orgs` is renamed to `POST /api/v1/facilities` (organizations→facilities tenant rename, #284); `/orgs` (no `/api` prefix) is removed.
- Legacy `/api/snapshots/:alertId` is removed; use `GET`/`PUT /api/v1/alerts/:alertId/snapshot`.
- `/api.alerts/events` is removed, not renamed; live ML ingress is the Event API.
- Resident/guardian CRUD and resident assignment routes are removed from v1 room-centric backend. Reintroducing them is a v2 schema/API addition, not a route alias.
- Room sub-area routes are removed from the v1 room-centric backend and must remain unmounted unless a future schema/API addition reintroduces that domain.
- `/auth/*` moves to `/api/v1/auth/*`; no unversioned compatibility alias is retained.
