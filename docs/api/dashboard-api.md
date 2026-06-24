# Dashboard API

The dashboard API is the authenticated backend read-model and admin CRUD surface consumed by the Vite + React frontend. All product `/api/*` dashboard routes use camelCase JSON responses for the frontend SSOT and are facility-scoped unless noted.

## Auth and onboarding flow

1. Browser opens `GET /auth/kakao/login`.
2. Backend sets the OAuth state cookie and redirects to Kakao with scopes including `talk_message profile_nickname`.
3. Kakao redirects to `GET /auth/kakao/callback?code=...&state=...`.
4. Backend validates state, exchanges the code, stores/updates Kakao identity, sets the session cookie, then redirects:
   - `/dashboard` when the user already has a facility.
   - `/onboarding` when the user needs to create one.
5. Frontend/server rendering reads `GET /auth/session` for the current user.
6. Onboarding creates the facility through `POST /api/facilities`.
7. Dashboard uses `/api/facilities/current`, `/api/floors`, `/api/spaces`, `/api/zones`, `/api/residents`, `/api/resident-assignments`, `/api/alerts`, `/api/status`, `/api/cameras`, `/api/guardians`, snapshots, and `/api/sse`.

`POST /auth/logout` revokes the session and clears the session cookie.

## Alerts read-model

### `GET /api/alerts`

Query parameters:

- `limit?` — max rows to return.
- `beforeSeq?` — page backward before a bigint alert sequence.
- Current service also supports `residentId?`, `status?`, and `afterSeq?`; these remain allowed unless a later docs/api change removes them.

Response: list of facility-scoped alerts. Alert SSE and pagination identity is `alertSeq` serialized as a string when crossing JSON/SSE boundaries.

### `GET /api/alerts/:id`

Returns one facility-scoped alert detail by alert id.

### `PATCH /api/alerts/:id/ack`

Acknowledges one facility-scoped alert. No request body. Response is the updated alert as returned by `AlertsService.ack`.

## Snapshot API

Snapshot paths are nested under the alert:

- `GET /api/alerts/:alertId/snapshot`
- `PUT /api/alerts/:alertId/snapshot`

### `PUT /api/alerts/:alertId/snapshot`

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

### `GET /api/alerts/:alertId/snapshot`

The backend checks alert ownership and streams the stored file. Response headers include private cache semantics. Missing snapshot or path escape is a facility-scoped not-found.

## Resident status

### `GET /api/status`

Returns current resident status rows for the caller facility. This is the dashboard's reload/read-model source for state such as fall/warning/normal and camera online state.

### `GET /api/status/:residentId`

Returns current status for one facility-scoped resident.

## CRUD resources

These routes are current. Product resource routes are facility-scoped via `SessionGuard`, `RequireFacilityGuard`, and, where controllers attach it, `FacilityContextInterceptor`.

### Facility

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/facilities/current` | none | current facility |
| PATCH | `/api/facilities/current` | partial `{ name?: string, address?: string or null, phone?: string or null }` (`code` is immutable — ignored if sent) | updated facility |

### Floors

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/floors` | none | floor list |
| POST | `/api/floors` | `{ name?: string, orderIndex?: number, isActive?: boolean }` | created floor |
| PATCH | `/api/floors/:floorId` | partial `{ name?: string, orderIndex?: number, isActive?: boolean }` | updated floor |
| DELETE | `/api/floors/:floorId` | none | `204` empty; `409` when active child spaces reference the floor |

### Spaces

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/spaces?floorId=&type=&isActive=` | none | space list, optionally filtered |
| GET | `/api/spaces/:spaceId` | none | one space |
| POST | `/api/spaces` | `{ floorId?: string, name?: string, type?: SpaceType, capacity?: number, isActive?: boolean, assignedStaff?: string or null }` | created space; camera placement uses `Camera.spaceId` |
| PATCH | `/api/spaces/:spaceId` | partial `{ floorId?: string, name?: string, type?: SpaceType, capacity?: number, isActive?: boolean, assignedStaff?: string or null }` | updated space; camera placement uses camera APIs |
| DELETE | `/api/spaces/:spaceId` | none | soft-deleted space body (`200`) |

### Zones

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/zones?spaceId=&type=` | none | zone list, optionally filtered |
| POST | `/api/zones` | `{ spaceId?: string, name?: string, type?: ZoneType, orderIndex?: number }` | created zone |
| PATCH | `/api/zones/:zoneId` | partial `{ spaceId?: string, name?: string, type?: ZoneType, orderIndex?: number }` | updated zone |
| DELETE | `/api/zones/:zoneId` | none | `204` empty |

### Residents and assignments

Resident create is also the initial placement action: `spaceId` is required. Resident delete is soft and returns the updated resident body with `isActive: false`.

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/residents?isFocusResident=&spaceId=&active=` | none | resident list, optionally filtered |
| GET | `/api/residents/:id` | none | one resident, including `currentAssignment` in detail responses |
| POST | `/api/residents` | `{ name: string, spaceId: string, room?: string or null, zoneId?: string or null, gender?: string or null, age?: number or null, diagnosisTags?: string[], fallRiskBaseline?: Level or null, isFocusResident?: boolean }` | created and placed resident |
| PATCH | `/api/residents/:id` | partial `{ name?: string, room?: string or null, gender?: string or null, age?: number or null, diagnosisTags?: string[], fallRiskBaseline?: Level or null, isFocusResident?: boolean, isActive?: boolean }` | updated resident |
| DELETE | `/api/residents/:id` | none | soft-deleted resident body (`200`) |
| GET | `/api/residents/:id/assignment` | none | current assignment |
| PUT | `/api/residents/:id/assignment` | `{ spaceId: string, zoneId?: string or null }` | new active assignment for moved resident |
| GET | `/api/resident-assignments?residentId=&spaceId=&zoneId=&active=` | none | read-only assignment history |

Assignment responses use `{ id, facilityId, residentId, spaceId, zoneId, active, startedAt, endedAt }`.

### Cameras

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/cameras` | none | camera list |
| GET | `/api/cameras/:id` | none | one camera |
| POST | `/api/cameras` | `{ label: string, spaceId: string }` | created camera plus one-time `ingestSecret` |
| PATCH | `/api/cameras/:id` | partial `{ label?: string, spaceId?: string }` | updated camera |
| DELETE | `/api/cameras/:id` | none | delete result |

### Guardians

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/guardians?residentId=` | none | guardian list, optionally resident-filtered |
| GET | `/api/guardians/:id` | none | one guardian |
| POST | `/api/guardians` | `{ residentId: string, name: string, phone: string, relation?: string }` | created guardian |
| PATCH | `/api/guardians/:id` | partial `{ name?: string, phone?: string, relation?: string }` | updated guardian |
| DELETE | `/api/guardians/:id` | none | delete result |

## Deferred 501 skeletons

These guarded product routes exist in controllers but intentionally return `501` until their read models or policy surfaces land:

| Method | Path | Response |
|---|---|---|
| GET | `/api/space-statuses` | `{ error: "not_implemented", message: "space-statuses is not implemented yet" }` |
| GET | `/api/detection-events` | `{ error: "not_implemented", message: "detection-events is not implemented yet" }` |
| PATCH | `/api/detection-events/:id` | `{ error: "not_implemented", message: "detection-events is not implemented yet" }` |
| GET | `/api/alert-rules` | `{ error: "not_implemented", message: "alert-rules is not implemented yet" }` |
| POST | `/api/alert-rules` | `{ error: "not_implemented", message: "alert-rules is not implemented yet" }` |
| PATCH | `/api/alert-rules/:id` | `{ error: "not_implemented", message: "alert-rules is not implemented yet" }` |
| DELETE | `/api/alert-rules/:id` | `{ error: "not_implemented", message: "alert-rules is not implemented yet" }` |
| GET | `/api/resident-risk-summaries` | `{ error: "not_implemented", message: "resident-risk-summaries is not implemented yet" }` |

## Facility creation

### `POST /api/facilities`

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
