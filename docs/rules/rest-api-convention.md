# REST API convention

This repo has three HTTP namespaces. Do not add a fourth without an ADR.

## Namespaces

- `/api/*` is the product API used by the dashboard and other authenticated product clients.
  - Current examples: `GET /api/status`, `GET /api/alerts`, `PATCH /api/alerts/:id/ack`, `GET /api/cameras`, `GET /api/residents`, `GET /api/guardians`, `GET /api/sse`, and `POST /api/orgs`.
- `/auth/*` is session and OAuth only.
  - Current examples: `/auth/kakao/login`, `/auth/kakao/callback`, `/auth/session`, and `/auth/logout` in `backend/src/auth/auth.controller.ts`.
- `/ingest/*` is HMAC-authenticated edge ingress from cameras/devices.
  - Current canonical routes: `POST /ingest/alerts` and `POST /ingest/heartbeat` in `backend/src/ingest/ingest.controller.ts`.

## Path shape

- No dotted path segments. `/api.alerts/events` is banned; it came from the legacy pilot controller and must not be reintroduced.
- Use plural nouns for collections: `/api/alerts`, `/api/residents`, `/api/cameras`, `/api/guardians`, `/api/orgs`.
- Use nested singleton sub-resources when the resource exists only in the context of a parent.
  - Snapshot canonical path: `/api/alerts/:id/snapshot`.
  - Do not add new top-level snapshot paths such as `/api/snapshots/:alertId`.
- Use verbs only when the operation is not naturally represented as a resource state update. The existing `/api/alerts/:id/ack` mutation is accepted as the dashboard acknowledgement action; new status transitions should prefer resource-oriented naming unless there is a concrete reason.

## Status codes

- `201 Created` for creation or first accepted creation-like ingest.
  - `POST /ingest/alerts` returns `201` for a newly created alert.
  - Snapshot upload may return `201` when it stores a new snapshot object.
- `200 OK` for mutations that return a body or idempotent duplicate responses.
  - `PATCH /api/alerts/:id/ack` returns the updated alert.
  - Duplicate `/ingest/alerts` returns a body with duplicate status instead of pretending a second alert was created.
- `204 No Content` for logout or delete-like operations that intentionally return no body.
  - `POST /auth/logout` is the reference.

## Error shape

HTTP errors exposed to clients use a stable JSON shape:

```json
{ "error": "string-code-or-class", "message": "human readable detail" }
```

Controllers and exception filters may include framework status metadata, but clients may only depend on `error` and `message`. Do not invent per-route error envelopes.

## Atomic front + backend rename rule

A path rename must update backend routes, frontend callers, Next rewrites/proxies, tests, and docs in one change set. Never leave an intermediate state where the frontend calls a path the backend does not serve, or the backend only serves a path no frontend/test still exercises.

Concrete refactor targets from issue #216:
Removed/renamed routes must stay removed/renamed across frontend, backend, tests, and docs:

- `/orgs` is removed; use `POST /api/orgs`.
- `/api/snapshots/:alertId` is removed; use `GET`/`PUT /api/alerts/:alertId/snapshot`.
- `/api.alerts/events` is removed, not renamed, because `/ingest/alerts` is the only canonical alert ingress.
