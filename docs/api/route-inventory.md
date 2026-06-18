# Route Inventory

Target route inventory for issue #216. Auth names match backend guards: `SessionGuard` requires a valid session cookie, `RequireOrgGuard` requires `user.orgId`, and `HmacIngestGuard` verifies camera ingest headers.

| Method | Path | Auth guard | Request | Response | Status |
|---|---|---|---|---|---|
| GET | `/auth/kakao/login` | None | No body. | `302` redirect to Kakao OAuth authorize URL; sets OAuth state cookie. | Target; already in code |
| GET | `/auth/kakao/callback` | OAuth state cookie | Query: `code`, `state`. | `302` redirect to frontend `/dashboard` when user has org, otherwise `/onboarding`; sets session cookie and clears OAuth state cookie. | Target; already in code |
| GET | `/auth/session` | Session cookie validation without rotation | No body. | `{ user }` for valid session; unauthenticated sessions are rejected by session validation semantics. | Target; already in code |
| POST | `/auth/logout` | `SessionGuard` | No body. | `204` empty; revokes session and clears session cookie. | Target; already in code |
| POST | `/api/orgs` | `SessionGuard` | `{ facilityName: string, businessRegistrationNumber?: string or null }` | `{ user }` with refreshed org-bearing session cookie. | Target; not yet in code (`/orgs` exists) |
| GET | `/api/residents` | `SessionGuard`, `RequireOrgGuard` | No body. | Resident list for caller org. | Target; already in code |
| GET | `/api/residents/:id` | `SessionGuard`, `RequireOrgGuard` | Path `id`. | One org-scoped resident or org-scoped not found. | Target; already in code |
| POST | `/api/residents` | `SessionGuard`, `RequireOrgGuard` | `{ name: string, room?: string }` | Created resident. | Target; already in code; DTO validation pending |
| PATCH | `/api/residents/:id` | `SessionGuard`, `RequireOrgGuard` | Partial `{ name?: string, room?: string }` | Updated resident. | Target; already in code; DTO validation pending |
| DELETE | `/api/residents/:id` | `SessionGuard`, `RequireOrgGuard` | Path `id`. | Removed resident result. | Target; already in code |
| GET | `/api/cameras` | `SessionGuard`, `RequireOrgGuard` | No body. | Camera list for caller org. | Target; already in code |
| GET | `/api/cameras/:id` | `SessionGuard`, `RequireOrgGuard` | Path `id`. | One org-scoped camera. | Target; already in code |
| POST | `/api/cameras` | `SessionGuard`, `RequireOrgGuard` | `{ label: string, residentId?: string }` | Created camera, including ingest key metadata as service returns. | Target; already in code; DTO validation pending |
| PATCH | `/api/cameras/:id` | `SessionGuard`, `RequireOrgGuard` | Partial `{ label?: string, residentId?: string }` | Updated camera. | Target; already in code; DTO validation pending |
| DELETE | `/api/cameras/:id` | `SessionGuard`, `RequireOrgGuard` | Path `id`. | Removed camera result. | Target; already in code |
| GET | `/api/guardians` | `SessionGuard`, `RequireOrgGuard` | Optional query `residentId`. | Guardian list for caller org, optionally resident-filtered. | Target; already in code |
| GET | `/api/guardians/:id` | `SessionGuard`, `RequireOrgGuard` | Path `id`. | One org-scoped guardian. | Target; already in code |
| POST | `/api/guardians` | `SessionGuard`, `RequireOrgGuard` | `{ residentId: string, name: string, phone: string, relation?: string }` | Created guardian. | Target; already in code; DTO validation pending |
| PATCH | `/api/guardians/:id` | `SessionGuard`, `RequireOrgGuard` | Partial `{ name?: string, phone?: string, relation?: string }` | Updated guardian. | Target; already in code; DTO validation pending |
| DELETE | `/api/guardians/:id` | `SessionGuard`, `RequireOrgGuard` | Path `id`. | Removed guardian result. | Target; already in code |
| GET | `/api/status` | `SessionGuard`, `RequireOrgGuard` | No body. | Resident status list for caller org. | Target; already in code |
| GET | `/api/status/:residentId` | `SessionGuard`, `RequireOrgGuard` | Path `residentId`. | Status for one org-scoped resident. | Target; already in code |
| GET | `/api/alerts` | `SessionGuard`, `RequireOrgGuard` | Query: `limit?`, `beforeSeq?`; service also supports `residentId?`, `status?`, `afterSeq?`. | Alert list ordered by alert sequence for dashboard/history. | Target; already in code |
| GET | `/api/alerts/:id` | `SessionGuard`, `RequireOrgGuard` | Path `id`. | One org-scoped alert detail. | Target; already in code |
| PATCH | `/api/alerts/:id/ack` | `SessionGuard`, `RequireOrgGuard` | Path `id`; no body. | Acknowledged alert. | Target; already in code |
| GET | `/api/alerts/:alertId/snapshot` | `SessionGuard`, `RequireOrgGuard` | Path `alertId`. | Snapshot bytes with private cache headers; org-scoped alert ownership checked. | Target; not yet in code (`/api/snapshots/:alertId` exists) |
| PUT | `/api/alerts/:alertId/snapshot` | `SessionGuard`, `RequireOrgGuard` | Raw image body; content-type one of `image/jpeg`, `image/png`, `application/octet-stream`, `multipart/form-data`; max 2 MiB. | `201 { snapshotKey }`; server stores bytes under server-derived key. | Target; not yet in code (`/api/snapshots/:alertId` exists) |
| GET | `/api/sse` | `SessionGuard`, `RequireOrgGuard` | Header `Last-Event-ID?`; session cookie. | `text/event-stream`; alert/status/session frames. | Target; already in code |
| POST | `/ingest/alerts` | `HmacIngestGuard` | HMAC headers plus canonical alert JSON. | `201 { alertSeq, id, status: "created" or "duplicate" }`; duplicate is idempotent and repairs outbox. | Target; already in code, extraction/DTO pending |
| POST | `/ingest/heartbeat` | `HmacIngestGuard` | HMAC headers; empty-body canonical signing supported. | `200 { ok: true }`; updates camera online state and resident status when assigned. | Target; already in code |

## Removed routes

These routes are not part of the target contract and must not be kept as compatibility aliases after the refactor.

| Removed route | Current/legacy purpose | Target replacement |
|---|---|---|
| `POST /api.alerts/events` | Legacy pilot alert event ingress (`AlertEventsController`). | `POST /ingest/alerts` only. |
| `POST /orgs` | Onboarding organization creation without `/api` prefix. | `POST /api/orgs`. |
| `GET /api/snapshots/:alertId` | Legacy snapshot read path. | `GET /api/alerts/:alertId/snapshot`. |
| `PUT /api/snapshots/:alertId` | Legacy snapshot upload path. | `PUT /api/alerts/:alertId/snapshot`. |
| `GET /sse` | Backend auth/session rotation probe, not frontend SSE. | Test probes move to `/auth/session`; live stream remains `/api/sse`. |
| `GET /auth/me` | Backend auth probe; frontend uses `/auth/session`. | `/auth/session`. |
