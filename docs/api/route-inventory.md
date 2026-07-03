# Route Inventory

Current route inventory cross-checked against `backend/src/**/*.controller.ts` for the post-MVP surface. Product `/api/v1/*` JSON responses use camelCase. Browser auth uses the httpOnly `app_session` JWT cookie; `GET /api/v1/auth/me` is the bootstrap identity route.

## Facility scope header

`X-Facility-Id` is a request-scoped selector for `SUPER_ADMIN` users only. It does not mutate the JWT. Facility-bound users keep their token `facilityId`; a conflicting header cannot switch tenant scope.

## Current routes

| Method | Path | Guard / capability | Request | Response / notes |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/auth/kakao/login` | None | No body | `302` to Kakao OAuth authorize URL; sets OAuth state cookie. |
| GET | `/api/v1/auth/kakao/callback` | OAuth state cookie | Query `code`, `state` | Sets `app_session` for an existing Kakao-linked user and redirects by role/facility state; unregistered Kakao users return to login with `auth_error`. |
| POST | `/api/v1/auth/login` | None | `{ email: string, password: string }` | `{ user }`; sets `app_session`. Generic invalid credentials return `401`. |
| POST | `/api/v1/auth/register` | None | `{ name, email, password, phone, facilityName }` | Creates initial facility owner, returns `{ user }`, and sets `app_session`. |
| GET | `/api/v1/auth/me` | `JwtAuthGuard` | Cookie only | Authenticated user identity with `cache-control: no-store`; invalid/missing JWT returns `401`. |
| POST | `/api/v1/auth/logout` | `JwtAuthGuard` | No body | `204`; increments `sessionVersion` and clears `app_session`. |
| POST | `/api/v1/facilities` | `JwtAuthGuard`, `RolesGuard`, `@RequireCapability('facilityAdmin')` | `{ facilityName: string }` | Creates the authenticated user's initial facility and rotates `app_session`. |
| GET | `/api/v1/facilities` | `JwtAuthGuard` | No body | Facility selector list: `SUPER_ADMIN` receives all facilities; facility-bound users receive only their own facility. |
| GET | `/api/v1/facilities/:id` | `JwtAuthGuard`, `RequireFacilityGuard` | Path `id`; `SUPER_ADMIN` selects scope with `X-Facility-Id` | Returns the facility only when `:id` equals the effective facility scope; another facility returns `404`. |
| GET | `/api/v1/floors` | `JwtAuthGuard`, `RequireFacilityGuard`, `FacilityContextInterceptor` | No body | Floor list. |
| POST | `/api/v1/floors` | `JwtAuthGuard`, `RequireFacilityGuard`, `FacilityContextInterceptor`, `RolesGuard`, `@RequireCapability('facilityAdmin')` | `{ name?: string, orderIndex?: number, isActive?: boolean }` | Created floor; required-field conflicts return `409`. |
| PATCH | `/api/v1/floors/:floorId` | Same + `RolesGuard`, `@RequireCapability('facilityAdmin')` | Partial floor body | Updated floor. |
| DELETE | `/api/v1/floors/:floorId` | Same + `RolesGuard`, `@RequireCapability('facilityAdmin')` | Path `floorId` | `204`; `409` if active child spaces reference the floor. |
| GET | `/api/v1/spaces` | `JwtAuthGuard`, `RequireFacilityGuard`, `FacilityContextInterceptor` | Query `floorId?`, `type?`, `isActive?` | Space list. |
| GET | `/api/v1/spaces/:spaceId` | Same | Path `spaceId` | One facility-scoped space. |
| POST | `/api/v1/spaces` | Same + `RolesGuard`, `@RequireCapability('facilityAdmin')` | `{ floorId?, name?, type?, capacity?, isActive?, assignedStaff? }` | Created space. |
| PATCH | `/api/v1/spaces/:spaceId` | Same + `RolesGuard`, `@RequireCapability('facilityAdmin')` | Partial space body | Updated space. |
| DELETE | `/api/v1/spaces/:spaceId` | Same + `RolesGuard`, `@RequireCapability('facilityAdmin')` | Path `spaceId` | Soft-deleted space body with `isActive: false`. |
| GET | `/api/v1/spaces/:spaceId/zones` | `JwtAuthGuard`, `RequireFacilityGuard`, `FacilityContextInterceptor` | Query `type?` | Zone list for the space. |
| POST | `/api/v1/spaces/:spaceId/zones` | Same + `RolesGuard`, `@RequireCapability('facilityAdmin')` | `{ name?: string, type?: ZoneType, orderIndex?: number }` | Created zone. |
| PATCH | `/api/v1/spaces/:spaceId/zones/:zoneId` | Same + `RolesGuard`, `@RequireCapability('facilityAdmin')` | Partial zone body | Updated zone. |
| DELETE | `/api/v1/spaces/:spaceId/zones/:zoneId` | Same + `RolesGuard`, `@RequireCapability('facilityAdmin')` | Path `spaceId`, `zoneId` | `204`. |
| GET | `/api/v1/cameras` | `JwtAuthGuard`, `RequireFacilityGuard`, `FacilityContextInterceptor` | No body | Camera list. |
| GET | `/api/v1/cameras/:id` | Same | Path `id` | One camera. |
| POST | `/api/v1/cameras` | Same + `RolesGuard`, `@RequireCapability('facilityAdmin')` | `{ label: string, spaceId: string }` | Created camera. |
| PATCH | `/api/v1/cameras/:id` | Same + `RolesGuard`, `@RequireCapability('facilityAdmin')` | `{ label?: string, spaceId?: string }` | Updated camera. |
| DELETE | `/api/v1/cameras/:id` | Same + `RolesGuard`, `@RequireCapability('facilityAdmin')` | Path `id` | Removed camera result. |
| GET | `/api/v1/alerts` | `JwtAuthGuard`, `RequireFacilityGuard`, `FacilityContextInterceptor` | Query `limit?`, `beforeSeq?`, `residentId?`, `status?`, `afterSeq?` | Alert list ordered by alert sequence. |
| GET | `/api/v1/alerts/:id` | Same | Path `id` | One alert. |
| PATCH | `/api/v1/alerts/:id/resolve` | Same | Path `id` | Resolves alert in one step with `resolvedById`/`resolvedAt`; emits `alert-updated`. |
| GET | `/api/v1/alerts/:alertId/snapshot` | Same | Path `alertId` | Snapshot bytes with private cache headers. |
| PUT | `/api/v1/alerts/:alertId/snapshot` | Same | Raw image body, max 2 MiB | `201 { snapshotKey }`. |
| GET | `/api/v1/dashboard/stream` | `JwtAuthGuard`, `RequireFacilityGuard` | Header `Last-Event-ID?`; cookie | SSE stream with named `alert` and `alert-updated` frames. |
| POST | `/api/v1/events` | None | `{ camera_id: string, type: string, detected_at: string, confidence?: number }` | `201 { id, status }`; unknown camera returns `404`; unknown type returns `400`. |
| POST | `/api/v1/events/heartbeat` | None | `{ camera_id: string }` | `200 { ok: true }`; marks camera online/last seen. |
| GET | `/api/v1/events` | `JwtAuthGuard`, `RequireFacilityGuard`, `FacilityContextInterceptor` | No body | Authenticated facility event history. |

## Event API contract

`POST /api/v1/events` and `POST /api/v1/events/heartbeat` are the only live ML ingress endpoints. They are no-HMAC, accept camera-keyed JSON bodies, and resolve facility/space ownership from the backend camera record. Event type is trimmed and lowercased at ingress, must match the backend allowlist, and is otherwise accepted as the ML-provided type; backend does not apply probability re-thresholding, cooldowns, or hourly caps at ingress.

## Removed routes

These routes are not part of the target contract and must not be kept as compatibility aliases.

| Removed route | Current replacement |
| --- | --- |
| `GET /api/v1/auth/session` | `GET /api/v1/auth/me` |
| `GET /api/v1/facilities/current` | `GET /api/v1/facilities/:id` with effective facility scope |
| `PATCH /api/v1/facilities/current` | No current route; facility updates are not in the controller surface. |
| `GET /api/v1/status` | No route; dashboard state comes from alert/events read models and SSE invalidation. |
| `GET /api/v1/status/:residentId` | No route. |
| `GET /api/v1/space-statuses` | No route. |
| `GET /api/v1/resident-risk-summaries` | No route. |
| `GET /api/v1/protected-probe` | No route; use `GET /api/v1/auth/me` for auth bootstrap. |
| `GET /api/v1/facility-protected-probe` | No route. |
| `POST /api.alerts/events` | `POST /api/v1/events`. |
| `POST /orgs` | `POST /api/v1/facilities`. |
| `POST /api/orgs` | `POST /api/v1/facilities`. |
| `GET /api/snapshots/:alertId` | `GET /api/v1/alerts/:alertId/snapshot`. |
| `PUT /api/snapshots/:alertId` | `PUT /api/v1/alerts/:alertId/snapshot`. |
| `GET /api/v1/sse` | `GET /api/v1/dashboard/stream`. |
| Unversioned `/auth/*` | Versioned `/api/v1/auth/*` routes only. |
| `GET/PATCH /api/v1/detection-events` | None. |
| `GET/POST/PATCH/DELETE /api/v1/alert-rules` | None. |
| `GET/POST/PATCH/DELETE /api/v1/residents`, `/api/v1/residents/:id/assignment`, `/api/v1/residents/assignments` | None — v1 is room-centric; no compatibility alias (v2 re-adds resident placement as a new schema/API). |
| `GET/POST/PATCH/DELETE /api/v1/guardians` | None — v1 is room-centric; no compatibility alias (v2 re-adds guardians as a new schema/API). |
