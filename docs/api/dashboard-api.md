# Dashboard API

The dashboard API is the authenticated backend read-model and admin CRUD surface consumed by the Vite + React frontend. All product `/api/v1/*` dashboard routes use camelCase JSON responses for the frontend SSOT and are facility-scoped unless noted.

## Auth and onboarding flow

1. The browser authenticates through either `POST /auth/login` with email/password or `GET /auth/kakao/login`.
2. For email/password, the backend validates the password hash and sets the same session cookie used by OAuth.
3. For Kakao, the backend sets the OAuth state cookie, redirects to Kakao with the env-driven scope from ADR-071 (default `talk_message`), then receives `GET /auth/kakao/callback?code=...&state=...`.
4. Backend validates state, exchanges the code, stores/updates Kakao identity, sets the session cookie, then redirects:
   - `/dashboard` when the user already has a facility.
   - `/onboarding` when the user needs to create one.
5. Frontend/server rendering reads `GET /auth/session` for the current user.
6. Onboarding creates the facility through `POST /api/v1/facilities`.
7. Dashboard uses `/api/v1/facilities/current`, `/api/v1/floors`, `/api/v1/spaces`, `/api/v1/zones`, `/api/v1/residents`, `/api/v1/resident-assignments`, `/api/v1/alerts`, `/api/v1/status`, `/api/v1/cameras`, `/api/v1/guardians`, snapshots, and `/api/v1/sse`.

`POST /auth/logout` revokes the session and clears the session cookie.

## Alerts read-model

### `GET /api/v1/alerts`

Query parameters:

- `limit?` — max rows to return.
- `beforeSeq?` — page backward before a bigint alert sequence.
- Current service also supports `residentId?`, `status?`, and `afterSeq?`; these remain allowed unless a later docs/api change removes them.

Response: list of facility-scoped alerts. Alert SSE and pagination identity is `alertSeq` serialized as a string when crossing JSON/SSE boundaries.

### `GET /api/v1/alerts/:id`

Returns one facility-scoped alert detail by alert id.

### `PATCH /api/v1/alerts/:id/ack`

Acknowledges one facility-scoped alert. No request body. Response is the updated alert as returned by `AlertsService.ack`.

## Snapshot API

Snapshot paths are nested under the alert:

- `GET /api/v1/alerts/:alertId/snapshot`
- `PUT /api/v1/alerts/:alertId/snapshot`

### `PUT /api/v1/alerts/:alertId/snapshot`

Request body: raw snapshot bytes, max 2 MiB.

Supported content-types from current controller:

- `image/jpeg` → `.jpg`
- `image/png` → `.png`
- `application/octet-stream` → `.bin`
- `multipart/form-data` → `.bin`

The backend checks that the alert belongs to the caller facility, stores bytes under a server-derived key beneath `SNAPSHOT_DIR`, and records `snapshotKey` on the alert. It never fetches edge-provided URLs.

Response:

```json
{ "snapshotKey": "facility_id/alert_id.jpg" }
```

### `GET /api/v1/alerts/:alertId/snapshot`

The backend checks alert ownership and streams the stored file. Response headers include private cache semantics. Missing snapshot or path escape is a facility-scoped not-found.

## Resident status

### `GET /api/v1/status`

Returns current resident status rows for the caller facility. This is the dashboard's reload/read-model source for state such as fall/warning/normal and camera online state.

### `GET /api/v1/status/:residentId`

Returns current status for one facility-scoped resident.

## CRUD resources

These routes are current. Product resource routes are facility-scoped via `SessionGuard`, `RequireFacilityGuard`, and, where controllers attach it, `FacilityContextInterceptor`.

### Facility

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/v1/facilities/current` | none | current facility |
| PATCH | `/api/v1/facilities/current` | partial `{ name?: string, address?: string or null, phone?: string or null }` (`code` is immutable — ignored if sent) | updated facility |

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
| POST | `/api/v1/spaces` | `{ floorId?: string, name?: string, type?: SpaceType, capacity?: number, isActive?: boolean, assignedStaff?: string or null }` | created space; camera placement uses `Camera.spaceId` |
| PATCH | `/api/v1/spaces/:spaceId` | partial `{ floorId?: string, name?: string, type?: SpaceType, capacity?: number, isActive?: boolean, assignedStaff?: string or null }` | updated space; camera placement uses camera APIs |
| DELETE | `/api/v1/spaces/:spaceId` | none | soft-deleted space body (`200`) |

### Zones

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/v1/zones?spaceId=&type=` | none | zone list, optionally filtered |
| POST | `/api/v1/zones` | `{ spaceId?: string, name?: string, type?: ZoneType, orderIndex?: number }` | created zone |
| PATCH | `/api/v1/zones/:zoneId` | partial `{ spaceId?: string, name?: string, type?: ZoneType, orderIndex?: number }` | updated zone |
| DELETE | `/api/v1/zones/:zoneId` | none | `204` empty |

### Residents and assignments

Resident create is also the initial placement action: `spaceId` is required. Resident delete is soft and returns the updated resident body with `isActive: false`.

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/v1/residents?isFocusResident=&spaceId=&active=` | none | resident list, optionally filtered |
| GET | `/api/v1/residents/:id` | none | one resident, including `currentAssignment` in detail responses |
| POST | `/api/v1/residents` | `{ name: string, spaceId: string, room?: string or null, zoneId?: string or null, gender?: string or null, age?: number or null, diagnosisTags?: string[], fallRiskBaseline?: Level or null, isFocusResident?: boolean }` | created and placed resident |
| PATCH | `/api/v1/residents/:id` | partial `{ name?: string, room?: string or null, gender?: string or null, age?: number or null, diagnosisTags?: string[], fallRiskBaseline?: Level or null, isFocusResident?: boolean, isActive?: boolean }` | updated resident |
| DELETE | `/api/v1/residents/:id` | none | soft-deleted resident body (`200`) |
| GET | `/api/v1/residents/:id/assignment` | none | current assignment |
| PUT | `/api/v1/residents/:id/assignment` | `{ spaceId: string, zoneId?: string or null }` | new active assignment for moved resident |
| GET | `/api/v1/resident-assignments?residentId=&spaceId=&zoneId=&active=` | none | read-only assignment history |

Assignment responses use `{ id, facilityId, residentId, spaceId, zoneId, active, startedAt, endedAt }`.

### Cameras

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/v1/cameras` | none | camera list |
| GET | `/api/v1/cameras/:id` | none | one camera |
| POST | `/api/v1/cameras` | `{ label: string, spaceId: string }` | created camera plus one-time `ingestSecret` |
| PATCH | `/api/v1/cameras/:id` | partial `{ label?: string, spaceId?: string }` | updated camera |
| DELETE | `/api/v1/cameras/:id` | none | delete result |

### Guardians

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/v1/guardians?residentId=` | none | guardian list, optionally resident-filtered |
| GET | `/api/v1/guardians/:id` | none | one guardian |
| POST | `/api/v1/guardians` | `{ residentId: string, name: string, phone: string, relation?: string }` | created guardian |
| PATCH | `/api/v1/guardians/:id` | partial `{ name?: string, phone?: string, relation?: string }` | updated guardian |
| DELETE | `/api/v1/guardians/:id` | none | delete result |

## Deferred 501 skeletons

These guarded product routes exist in controllers but intentionally return `501` until their read models or policy surfaces land:

| Method | Path | Response |
|---|---|---|
| GET | `/api/v1/space-statuses` | `{ error: "not_implemented", message: "space-statuses is not implemented yet" }` |
| GET | `/api/v1/resident-risk-summaries` | `{ error: "not_implemented", message: "resident-risk-summaries is not implemented yet" }` |

## Facility creation

### `POST /api/v1/facilities`

Current onboarding route. It uses `SessionGuard` but does not require an existing facility.

Request:

```json
{
  "facilityName": "Happy Care Home",
  "businessRegistrationNumber": "optional"
}
```

Response:

```json
{ "user": { "id": "...", "facilityId": "..." } }
```

The backend creates the facility for the authenticated user and rotates the session cookie so subsequent facility-protected dashboard routes pass `RequireFacilityGuard`.
