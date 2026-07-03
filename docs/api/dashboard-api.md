# Dashboard API

The dashboard API is the authenticated backend read-model and admin CRUD surface consumed by the Vite + React frontend. Product `/api/v1/*` dashboard routes use camelCase JSON responses and are facility-scoped unless noted.

## Auth and onboarding flow

1. The browser authenticates through `POST /api/v1/auth/login` or `GET /api/v1/auth/kakao/login`.
2. Email/password login verifies the scrypt password hash and sets the httpOnly `app_session` cookie.
3. Kakao login sets an OAuth state cookie, completes `GET /api/v1/auth/kakao/callback?code=...&state=...`, links an existing local account, sets the same JWT cookie, and redirects by role/facility state.
4. Frontend bootstrap reads `GET /api/v1/auth/me` with `credentials: "include"`.
5. Onboarding creates the initial facility through `POST /api/v1/facilities` and rotates the cookie with the facility-bearing user claims.
6. `SUPER_ADMIN` facility selection uses `GET /api/v1/facilities`; tenant-scoped requests then send `X-Facility-Id: <facilityId>`. Facility-bound users cannot switch tenant with this header.
7. Dashboard uses `/api/v1/facilities`, `/api/v1/facilities/:id`, `/api/v1/floors`, `/api/v1/spaces`, `/api/v1/spaces/:spaceId/zones`, `/api/v1/alerts`, `/api/v1/events`, `/api/v1/cameras`, alert snapshots, and `/api/v1/dashboard/stream`.

`POST /api/v1/auth/logout` increments `sessionVersion`, clears the cookie, and returns `204`.

## Alerts read-model

### `GET /api/v1/alerts`

Query parameters: `limit?`, `beforeSeq?`, `residentId?`, `status?`, and `afterSeq?`.

Response: facility-scoped alerts ordered by alert sequence. Alert SSE and pagination identity is `alertSeq` serialized as a string when crossing JSON/SSE boundaries.

### `GET /api/v1/alerts/:id`

Returns one facility-scoped alert detail by alert id.

### `PATCH /api/v1/alerts/:id/resolve`

Resolves one facility-scoped alert in a single step. The backend records `resolvedById` and `resolvedAt`, returns the updated alert, and emits `event: alert-updated`.

## Snapshot API

Snapshot paths are nested under the alert:

- `GET /api/v1/alerts/:alertId/snapshot`
- `PUT /api/v1/alerts/:alertId/snapshot`

`PUT` accepts raw snapshot bytes up to 2 MiB with `image/jpeg`, `image/png`, `application/octet-stream`, or `multipart/form-data`. The backend checks alert ownership, stores bytes under a server-derived key beneath `SNAPSHOT_DIR`, records `snapshotKey`, and never fetches edge-provided URLs.

`GET` checks alert ownership and streams the stored file with private cache headers. Missing snapshot or path escape is a facility-scoped not-found.

## CRUD resources

These routes are current. Product resource routes use `JwtAuthGuard`; tenant-scoped routes also use `RequireFacilityGuard`, and most tenant-resource controllers attach `FacilityContextInterceptor`. Admin mutations use `RolesGuard` plus `@RequireCapability('facilityAdmin')`.

### Facility

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/v1/facilities` | none | role-aware selector list: `SUPER_ADMIN` receives all facilities; facility-bound users receive only their own facility |
| GET | `/api/v1/facilities/:id` | none | the requested facility when it matches the effective facility scope; another facility returns `404` |

### Floors

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/v1/floors` | none | floor list |
| POST | `/api/v1/floors` | `{ name?: string, orderIndex?: number, isActive?: boolean }` | created floor |
| PATCH | `/api/v1/floors/:floorId` | partial `{ name?: string, orderIndex?: number, isActive?: boolean }` | updated floor |
| DELETE | `/api/v1/floors/:floorId` | none | `204` empty; `409` when active child spaces reference the floor |

### Spaces

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/v1/spaces?floorId=&type=&isActive=` | none | space list, optionally filtered |
| GET | `/api/v1/spaces/:spaceId` | none | one space |
| POST | `/api/v1/spaces` | `{ floorId?: string, name?: string, type?: SpaceType, capacity?: number, isActive?: boolean, assignedStaff?: string or null }` | created space |
| PATCH | `/api/v1/spaces/:spaceId` | partial `{ floorId?: string, name?: string, type?: SpaceType, capacity?: number, isActive?: boolean, assignedStaff?: string or null }` | updated space |
| DELETE | `/api/v1/spaces/:spaceId` | none | soft-deleted space body (`200`) |

### Zones

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/v1/spaces/:spaceId/zones?type=` | none | zone list for the space, optionally filtered by type |
| POST | `/api/v1/spaces/:spaceId/zones` | `{ name?: string, type?: ZoneType, orderIndex?: number }` | created zone |
| PATCH | `/api/v1/spaces/:spaceId/zones/:zoneId` | partial `{ name?: string, type?: ZoneType, orderIndex?: number }` | updated zone |
| DELETE | `/api/v1/spaces/:spaceId/zones/:zoneId` | none | `204` empty |

### Cameras

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/v1/cameras` | none | camera list |
| GET | `/api/v1/cameras/:id` | none | one camera |
| POST | `/api/v1/cameras` | `{ label: string, spaceId: string }` | created camera |
| PATCH | `/api/v1/cameras/:id` | partial `{ label?: string, spaceId?: string }` | updated camera |
| DELETE | `/api/v1/cameras/:id` | none | delete result |

## Events and stream

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/v1/events` | none | authenticated facility event history |
| POST | `/api/v1/events` | `{ camera_id: string, type: string, detected_at: string, confidence?: number }` | `{ id, status: "created" | "duplicate" }` |
| POST | `/api/v1/events/heartbeat` | `{ camera_id: string }` | `{ ok: true }` |
| GET | `/api/v1/dashboard/stream` | `Last-Event-ID?` header | SSE stream with named `alert` and `alert-updated` frames |

## Facility creation

### `POST /api/v1/facilities`

Current onboarding route. It uses `JwtAuthGuard`, `RolesGuard`, and `@RequireCapability('facilityAdmin')`, but does not require an existing facility.

Request:

```json
{ "facilityName": "Happy Care Home" }
```

Response:

```json
{ "user": { "id": "...", "facilityId": "..." } }
```

The backend creates the facility for the authenticated user and rotates the JWT cookie so subsequent facility-protected dashboard routes pass `RequireFacilityGuard`.
