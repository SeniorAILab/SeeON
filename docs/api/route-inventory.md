# Route Inventory

Current route inventory for issue #216 plus the post-rename facility/placement routes. Auth names match backend guards: `SessionGuard` requires a valid session cookie, `RequireFacilityGuard` requires `user.facilityId`, and `HmacIngestGuard` verifies camera ingest headers. Product `/api/*` JSON responses use camelCase for frontend consumption.

| Method | Path | Auth guard | Request | Response | Status |
|---|---|---|---|---|---|
| GET | `/auth/kakao/login` | None | No body. | `302` redirect to Kakao OAuth authorize URL; sets OAuth state cookie. | Current |
| GET | `/auth/kakao/callback` | OAuth state cookie | Query: `code`, `state`. | `302` redirect to frontend `/dashboard` when user has a facility, otherwise `/onboarding`; sets session cookie and clears OAuth state cookie. | Current |
| POST | `/auth/login` | None | `{ email: string, password: string }` | `{ user }` with the same backend session cookie used by Kakao login. Generic invalid credentials return `401`. | Current |
| GET | `/auth/session` | Session cookie validation; refreshes (rotates) the session cookie when the token is due for rotation | No body. | `{ user }` for valid session; unauthenticated sessions are rejected by session validation semantics. | Current |
| POST | `/auth/logout` | `SessionGuard` | No body. | `204` empty; revokes session and clears session cookie. | Current |
| POST | `/api/facilities` | `SessionGuard` | `{ facilityName: string, businessRegistrationNumber?: string or null }` | `{ user }` with refreshed facility-bearing session cookie; user includes `facilityId`. | Current onboarding |
| GET | `/api/facilities/current` | `SessionGuard`, `RequireFacilityGuard` | No body. | Current facility for caller. | Current |
| PATCH | `/api/facilities/current` | `SessionGuard`, `RequireFacilityGuard` | Partial `{ name?: string, address?: string or null, phone?: string or null }`. `code` is immutable — it is not part of the update and is ignored if sent. | Updated current facility. | Current |
| GET | `/api/floors` | `SessionGuard`, `RequireFacilityGuard`, `FacilityContextInterceptor` | No body. | Floor list for caller facility. | Current |
| POST | `/api/floors` | `SessionGuard`, `RequireFacilityGuard`, `FacilityContextInterceptor` | `{ name?: string, orderIndex?: number, isActive?: boolean }` | Created floor. | Current; `409` when `name` is missing |
| PATCH | `/api/floors/:floorId` | `SessionGuard`, `RequireFacilityGuard`, `FacilityContextInterceptor` | Partial `{ name?: string, orderIndex?: number, isActive?: boolean }` | Updated floor. | Current |
| DELETE | `/api/floors/:floorId` | `SessionGuard`, `RequireFacilityGuard`, `FacilityContextInterceptor` | Path `floorId`. | `204` empty. | Current hard delete; `409` if active child spaces reference the floor |
| GET | `/api/spaces` | `SessionGuard`, `RequireFacilityGuard`, `FacilityContextInterceptor` | Query: `floorId?`, `type?`, `isActive?`. | Space list for caller facility. | Current |
| GET | `/api/spaces/:spaceId` | `SessionGuard`, `RequireFacilityGuard`, `FacilityContextInterceptor` | Path `spaceId`. | One facility-scoped space. | Current |
| POST | `/api/spaces` | `SessionGuard`, `RequireFacilityGuard`, `FacilityContextInterceptor` | `{ floorId?: string, name?: string, type?: SpaceType, capacity?: number, isActive?: boolean, assignedStaff?: string or null }` | Created space. | Current; required-field conflicts return `409`; cameras attach through `Camera.spaceId` |
| PATCH | `/api/spaces/:spaceId` | `SessionGuard`, `RequireFacilityGuard`, `FacilityContextInterceptor` | Partial `{ floorId?: string, name?: string, type?: SpaceType, capacity?: number, isActive?: boolean, assignedStaff?: string or null }` | Updated space. | Current; camera placement is updated through camera APIs |
| DELETE | `/api/spaces/:spaceId` | `SessionGuard`, `RequireFacilityGuard`, `FacilityContextInterceptor` | Path `spaceId`. | Soft-deleted space body with `isActive: false`. | Current soft delete; `200` body |
| GET | `/api/zones` | `SessionGuard`, `RequireFacilityGuard`, `FacilityContextInterceptor` | Query: `spaceId?`, `type?`. | Zone list for caller facility. | Current |
| POST | `/api/zones` | `SessionGuard`, `RequireFacilityGuard`, `FacilityContextInterceptor` | `{ spaceId?: string, name?: string, type?: ZoneType, orderIndex?: number }` | Created zone. | Current |
| PATCH | `/api/zones/:zoneId` | `SessionGuard`, `RequireFacilityGuard`, `FacilityContextInterceptor` | Partial `{ spaceId?: string, name?: string, type?: ZoneType, orderIndex?: number }` | Updated zone. | Current |
| DELETE | `/api/zones/:zoneId` | `SessionGuard`, `RequireFacilityGuard`, `FacilityContextInterceptor` | Path `zoneId`. | `204` empty. | Current hard delete |
| GET | `/api/residents` | `SessionGuard`, `RequireFacilityGuard`, `FacilityContextInterceptor` | Query: `isFocusResident?`, `spaceId?`, `active?`. | Resident list for caller facility. | Current |
| GET | `/api/residents/:id` | `SessionGuard`, `RequireFacilityGuard`, `FacilityContextInterceptor` | Path `id`. | One facility-scoped resident, including `currentAssignment` when present. | Current |
| POST | `/api/residents` | `SessionGuard`, `RequireFacilityGuard`, `FacilityContextInterceptor` | `{ name: string, spaceId: string, room?: string or null, zoneId?: string or null, gender?: string or null, age?: number or null, diagnosisTags?: string[], fallRiskBaseline?: Level or null, isFocusResident?: boolean }` | Created and placed resident. | Current create=place; `spaceId` required |
| PATCH | `/api/residents/:id` | `SessionGuard`, `RequireFacilityGuard`, `FacilityContextInterceptor` | Partial `{ name?: string, room?: string or null, gender?: string or null, age?: number or null, diagnosisTags?: string[], fallRiskBaseline?: Level or null, isFocusResident?: boolean, isActive?: boolean }` | Updated resident. | Current |
| DELETE | `/api/residents/:id` | `SessionGuard`, `RequireFacilityGuard`, `FacilityContextInterceptor` | Path `id`. | Soft-deleted resident body with `isActive: false`. | Current soft delete; `200` body |
| GET | `/api/residents/:id/assignment` | `SessionGuard`, `RequireFacilityGuard`, `FacilityContextInterceptor` | Path `id`. | Current assignment `{ id, facilityId, residentId, spaceId, zoneId, active, startedAt, endedAt }`. | Current |
| PUT | `/api/residents/:id/assignment` | `SessionGuard`, `RequireFacilityGuard`, `FacilityContextInterceptor` | `{ spaceId: string, zoneId?: string or null }` | New active assignment for moved resident. | Current move; `spaceId` required |
| GET | `/api/resident-assignments` | `SessionGuard`, `RequireFacilityGuard`, `FacilityContextInterceptor` | Query: `residentId?`, `spaceId?`, `zoneId?`, `active?`. | Read-only assignment history list. | Current |
| GET | `/api/cameras` | `SessionGuard`, `RequireFacilityGuard`, `FacilityContextInterceptor` | No body. | Camera list for caller facility. | Current |
| GET | `/api/cameras/:id` | `SessionGuard`, `RequireFacilityGuard`, `FacilityContextInterceptor` | Path `id`. | One facility-scoped camera. | Current |
| POST | `/api/cameras` | `SessionGuard`, `RequireFacilityGuard`, `FacilityContextInterceptor` | `{ label: string, spaceId: string }` | Created camera, including ingest key metadata as service returns. | Current; `spaceId` required |
| PATCH | `/api/cameras/:id` | `SessionGuard`, `RequireFacilityGuard`, `FacilityContextInterceptor` | Partial `{ label?: string, spaceId?: string }` | Updated camera. | Current |
| DELETE | `/api/cameras/:id` | `SessionGuard`, `RequireFacilityGuard`, `FacilityContextInterceptor` | Path `id`. | Removed camera result. | Current |
| GET | `/api/guardians` | `SessionGuard`, `RequireFacilityGuard`, `FacilityContextInterceptor` | Optional query `residentId`. | Guardian list for caller facility, optionally resident-filtered. | Current |
| GET | `/api/guardians/:id` | `SessionGuard`, `RequireFacilityGuard`, `FacilityContextInterceptor` | Path `id`. | One facility-scoped guardian. | Current |
| POST | `/api/guardians` | `SessionGuard`, `RequireFacilityGuard`, `FacilityContextInterceptor` | `{ residentId: string, name: string, phone: string, relation?: string }` | Created guardian. | Current |
| PATCH | `/api/guardians/:id` | `SessionGuard`, `RequireFacilityGuard`, `FacilityContextInterceptor` | Partial `{ name?: string, phone?: string, relation?: string }` | Updated guardian. | Current |
| DELETE | `/api/guardians/:id` | `SessionGuard`, `RequireFacilityGuard`, `FacilityContextInterceptor` | Path `id`. | Removed guardian result. | Current |
| GET | `/api/status` | `SessionGuard`, `RequireFacilityGuard` | No body. | Resident status list for caller facility. | Current |
| GET | `/api/status/:residentId` | `SessionGuard`, `RequireFacilityGuard` | Path `residentId`. | Status for one facility-scoped resident. | Current |
| GET | `/api/alerts` | `SessionGuard`, `RequireFacilityGuard` | Query: `limit?`, `beforeSeq?`; service also supports `residentId?`, `status?`, `afterSeq?`. | Alert list ordered by alert sequence for dashboard/history. | Current |
| GET | `/api/alerts/:id` | `SessionGuard`, `RequireFacilityGuard` | Path `id`. | One facility-scoped alert detail. | Current |
| PATCH | `/api/alerts/:id/ack` | `SessionGuard`, `RequireFacilityGuard` | Path `id`; no body. | Acknowledged alert. | Current |
| GET | `/api/alerts/:alertId/snapshot` | `SessionGuard`, `RequireFacilityGuard` | Path `alertId`. | Snapshot bytes with private cache headers; facility-scoped alert ownership checked. | Current |
| PUT | `/api/alerts/:alertId/snapshot` | `SessionGuard`, `RequireFacilityGuard` | Raw image body; content-type one of `image/jpeg`, `image/png`, `application/octet-stream`, `multipart/form-data`; max 2 MiB. | `201 { snapshotKey }`; server stores bytes under server-derived key. | Current |
| GET | `/api/sse` | `SessionGuard`, `RequireFacilityGuard` | Header `Last-Event-ID?`; session cookie. | `text/event-stream`; alert/status/session frames. | Current |
| GET | `/api/protected-probe` | `SessionGuard` | No body. | `{ user }`; refreshes the rotated session cookie when due. Internal/test probe for the session guard (exercised by `backend/test/auth.spec.ts`). | Current (internal/test) |
| GET | `/api/facility-protected-probe` | `SessionGuard`, `RequireFacilityGuard` | No body. | `{ facilityId }`; refreshes the rotated session cookie when due. Internal/test probe for the facility guard. | Current (internal/test) |
| GET | `/api/space-statuses` | `SessionGuard`, `RequireFacilityGuard`, `FacilityContextInterceptor` | No body. | `501 { error: "not_implemented", message: "space-statuses is not implemented yet" }`. | Skeleton (501) |
| GET | `/api/detection-events` | `SessionGuard`, `RequireFacilityGuard`, `FacilityContextInterceptor` | No body. | `501 { error: "not_implemented", message: "detection-events is not implemented yet" }`. | Skeleton (501) |
| PATCH | `/api/detection-events/:id` | `SessionGuard`, `RequireFacilityGuard`, `FacilityContextInterceptor` | Path `id`; body shape deferred. | `501 { error: "not_implemented", message: "detection-events is not implemented yet" }`. | Skeleton (501) |
| GET | `/api/alert-rules` | `SessionGuard`, `RequireFacilityGuard`, `FacilityContextInterceptor` | No body. | `501 { error: "not_implemented", message: "alert-rules is not implemented yet" }`. | Skeleton (501) |
| POST | `/api/alert-rules` | `SessionGuard`, `RequireFacilityGuard`, `FacilityContextInterceptor` | Body shape deferred. | `501 { error: "not_implemented", message: "alert-rules is not implemented yet" }`. | Skeleton (501) |
| PATCH | `/api/alert-rules/:id` | `SessionGuard`, `RequireFacilityGuard`, `FacilityContextInterceptor` | Path `id`; body shape deferred. | `501 { error: "not_implemented", message: "alert-rules is not implemented yet" }`. | Skeleton (501) |
| DELETE | `/api/alert-rules/:id` | `SessionGuard`, `RequireFacilityGuard`, `FacilityContextInterceptor` | Path `id`. | `501 { error: "not_implemented", message: "alert-rules is not implemented yet" }`. | Skeleton (501) |
| GET | `/api/resident-risk-summaries` | `SessionGuard`, `RequireFacilityGuard`, `FacilityContextInterceptor` | No body. | `501 { error: "not_implemented", message: "resident-risk-summaries is not implemented yet" }`. | Skeleton (501) |
| POST | `/ingest/alerts` | `HmacIngestGuard` | HMAC headers plus canonical alert JSON. | `201 { alertSeq, id, status: "created" or "duplicate" }`; duplicate is idempotent and repairs outbox through the extracted ingest service/DTO. | Current |
| POST | `/ingest/heartbeat` | `HmacIngestGuard` | HMAC headers; empty-body canonical signing supported. | `200 { ok: true }`; updates camera online state and resident status when assigned. | Current |

## Removed routes

These routes are not part of the target contract and must not be kept as compatibility aliases after the refactor.

| Removed route | Current/legacy purpose | Target replacement |
|---|---|---|
| `POST /api.alerts/events` | Legacy pilot alert event ingress (`AlertEventsController`). | `POST /ingest/alerts` only. |
| `POST /orgs` | Onboarding organization creation without `/api` prefix. | `POST /api/facilities`. |
| `POST /api/orgs` | Earlier onboarding facility creation path during the rename. | `POST /api/facilities`. |
| `GET /api/snapshots/:alertId` | Legacy snapshot read path. | `GET /api/alerts/:alertId/snapshot`. |
| `PUT /api/snapshots/:alertId` | Legacy snapshot upload path. | `PUT /api/alerts/:alertId/snapshot`. |
| `GET /sse` | Backend auth/session rotation probe, not frontend SSE. | Test probes move to `/auth/session`; live stream remains `/api/sse`. |
| `GET /auth/me` | Backend auth probe; frontend uses `/auth/session`. | `/auth/session`. |
