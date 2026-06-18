# Dashboard API

The dashboard API is the authenticated backend read-model and admin CRUD surface consumed by the Next.js frontend. All `/api/*` dashboard routes use the session cookie and are org-scoped unless noted.

## Auth and onboarding flow

1. Browser opens `GET /auth/kakao/login`.
2. Backend sets the OAuth state cookie and redirects to Kakao with scopes including `talk_message profile_nickname`.
3. Kakao redirects to `GET /auth/kakao/callback?code=...&state=...`.
4. Backend validates state, exchanges the code, stores/updates Kakao identity, sets the session cookie, then redirects:
   - `/dashboard` when the user already has an organization.
   - `/onboarding` when the user needs to create one.
5. Frontend/server rendering reads `GET /auth/session` for the current user.
6. Onboarding creates the organization through `POST /api/orgs` (target; current code still serves `POST /orgs`).
7. Dashboard uses `/api/alerts`, `/api/status`, `/api/residents`, `/api/cameras`, `/api/guardians`, snapshots, and `/api/sse`.

`POST /auth/logout` revokes the session and clears the session cookie.

## Alerts read-model

### `GET /api/alerts`

Query parameters:

- `limit?` — max rows to return.
- `beforeSeq?` — page backward before a bigint alert sequence.
- Current service also supports `residentId?`, `status?`, and `afterSeq?`; these remain allowed unless a later docs/api change removes them.

Response: list of org-scoped alerts. Alert SSE and pagination identity is `alertSeq` serialized as a string when crossing JSON/SSE boundaries.

### `GET /api/alerts/:id`

Returns one org-scoped alert detail by alert id.

### `PATCH /api/alerts/:id/ack`

Acknowledges one org-scoped alert. No request body. Response is the updated alert as returned by `AlertsService.ack`.

## Snapshot API

Target snapshot path is nested under the alert:

- `GET /api/alerts/:alertId/snapshot`
- `PUT /api/alerts/:alertId/snapshot`

Current code still serves `GET/PUT /api/snapshots/:alertId`; that is a removed route in the target inventory.

### `PUT /api/alerts/:alertId/snapshot`

Request body: raw snapshot bytes, max 2 MiB.

Supported content-types from current controller:

- `image/jpeg` → `.jpg`
- `image/png` → `.png`
- `application/octet-stream` → `.bin`
- `multipart/form-data` → `.bin`

The backend checks that the alert belongs to the caller org, stores bytes under a server-derived key beneath `SNAPSHOT_DIR`, and records `snapshotKey` on the alert. It never fetches edge-provided URLs.

Response:

```json
{ "snapshotKey": "org_id/alert_id.jpg" }
```

### `GET /api/alerts/:alertId/snapshot`

The backend checks alert ownership and streams the stored file. Response headers include private cache semantics. Missing snapshot or path escape is an org-scoped not-found.

## Resident status

### `GET /api/status`

Returns current resident status rows for the caller org. This is the dashboard's reload/read-model source for state such as fall/warning/normal and camera online state.

### `GET /api/status/:residentId`

Returns current status for one org-scoped resident.

## CRUD resources

These routes are target/current except DTO validation is still pending in the refactor plan. All are org-scoped via `SessionGuard`, `RequireOrgGuard`, and `OrgContextInterceptor`.

### Residents

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/residents` | none | resident list |
| GET | `/api/residents/:id` | none | one resident |
| POST | `/api/residents` | `{ name: string, room?: string }` | created resident |
| PATCH | `/api/residents/:id` | partial `{ name?: string, room?: string }` | updated resident |
| DELETE | `/api/residents/:id` | none | delete result |

### Cameras

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/cameras` | none | camera list |
| GET | `/api/cameras/:id` | none | one camera |
| POST | `/api/cameras` | `{ label: string, residentId?: string }` | created camera |
| PATCH | `/api/cameras/:id` | partial `{ label?: string, residentId?: string }` | updated camera |
| DELETE | `/api/cameras/:id` | none | delete result |

### Guardians

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/guardians?residentId=` | none | guardian list, optionally resident-filtered |
| GET | `/api/guardians/:id` | none | one guardian |
| POST | `/api/guardians` | `{ residentId: string, name: string, phone: string, relation?: string }` | created guardian |
| PATCH | `/api/guardians/:id` | partial `{ name?: string, phone?: string, relation?: string }` | updated guardian |
| DELETE | `/api/guardians/:id` | none | delete result |

## Organization creation

### `POST /api/orgs`

Target; not yet in code. Current code serves `POST /orgs`.

Request:

```json
{
  "facilityName": "Happy Care Home",
  "businessRegistrationNumber": "optional"
}
```

Response:

```json
{ "user": { "id": "...", "orgId": "..." } }
```

The backend creates the organization for the authenticated user and rotates the session cookie so subsequent org-protected dashboard routes pass `RequireOrgGuard`.
