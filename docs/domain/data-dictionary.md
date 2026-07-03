# Domain data dictionary

This dictionary names the backend domain objects used by the dashboard, Event API edge, session system, and alert delivery pipeline. Prisma model names and field names are referenced from `backend/prisma/schema.prisma`. Relationship cardinality, FK direction, and RLS enrollment are canonicalized in [data-model.md](./data-model.md).

## Naming convention

Prisma model fields and product `/api/*` DTOs are camelCase. Database table/column names and ML Event API payloads are snake_case through `@map`, `@@map`, and DTO boundaries.

Examples:

- `User.facilityId` maps to `facility_id`.
- `Alert.alertSeq` maps to `alert_seq`.
- `AlertEvent.externalEventId` maps to `external_event_id`.
- Tables use `@@map`, such as `facilities`, `resident_statuses`, `alert_events`, and `delivery_attempts`.

This is the single convention across all tables. New schema fields must not use camelCase database columns.

## Glossary

### Facility

Tenant/facility root. `Facility` owns residents, cameras, guardians, alerts, floors, spaces, zones, assignments, users, Kakao identities, and server sessions. It is not itself an RLS tenant-domain list surface; app-layer membership determines which facility a user can act within.

Important fields: `id`, `name`, `businessRegistrationNumber`, `code`, `address`, `phone`, `createdAt`.

### User

Authenticated platform user. A user may be unbound from a facility until onboarding completes. `sessionVersion` invalidates existing sessions after account/security changes. Target RBAC roles are `SUPER_ADMIN`, `ADMIN`, and `STAFF` with product labels 시스템 관리자, 원장님, and 요양보호사. `STAFF` can create personal sessions and view the monitor dashboard but cannot administer the facility.

Important fields: `id`, `facilityId`, `kakaoId`, `nickname`, `role`, `sessionVersion`.

### KakaoIdentity

Encrypted Kakao OAuth identity/token record used for self-notification. `accessTokenCipher` stores the encrypted access token; refresh tokens are not stored in this build. Alert fan-out looks for users with Kakao identity rows in the target facility.

Important fields: `userId`, `facilityId`, `kakaoId`, `accessTokenCipher`, `tokenScope`, `tokenExpiresAt`.

### Auth (stateless JWT cookie)

Auth is a stateless JWT carried in the `app_session` httpOnly cookie; there is no server-session table. Revocation is enforced by comparing the JWT `sessionVersion` claim against `User.sessionVersion` (bumped on logout/role change), checked per request and on the SSE re-auth tick.

### Floor

Facility floor used to group room/space dashboards and operations. Floors are tenant/RLS-scoped and own spaces through a facility-scoped FK.

Important fields: `id`, `facilityId`, `name`, `orderIndex`, `isActive`.

### Space

Facility room or physical area. Space is the target canonical room anchor for cameras, resident placement history, zones, and alerts. Current schema still has transitional `cameraId`; target ownership is `Camera.spaceId`.

Important fields: `id`, `facilityId`, `floorId`, `name`, `type`, `capacity`, `isActive`, `assignedStaff`.

### Zone

Named sub-area inside a space, such as a bed or area. A resident assignment may optionally point to a zone for finer placement.

Important fields: `id`, `facilityId`, `spaceId`, `name`, `type`, `orderIndex`.

### Resident

Tenant-domain resident shown on the dashboard and linked to guardians, assignment history, alerts when the person is known, and current status. Canonical placement is `ResidentAssignment`; legacy `Resident.room` free text is not canonical placement and is removed by the room-centric remodel.

Important fields: `id`, `facilityId`, `name`, `isActive`, `gender`, `age`, `diagnosisTags`, `fallRiskBaseline`, `isFocusResident`.

### ResidentAssignment

Resident placement and movement history. It links one resident to one space, optionally one zone, for a time range. The current room is the active assignment; historical alert attribution uses the assignment covering the alert detection timestamp only when needed as migration evidence.

Important fields: `id`, `facilityId`, `residentId`, `spaceId`, `zoneId`, `startedAt`, `endedAt`.

### Guardian

Emergency contact for a resident. This is resident-linked tenant data; phone is stored in full and masked at the UI/presentation layer when needed.

Important fields: `id`, `facilityId`, `residentId`, `name`, `phone`, `relation`.

### Camera

Event-capable edge source. Cameras are identified by `camera_id` in the no-HMAC Event API; backend resolves facility and space from the camera record. Target model assigns each camera to exactly one space through `spaceId`; legacy resident assignment is removed.

Important fields: target `id`, `facilityId`, `spaceId`, `label`, `lastSeenAt`, `online`.

### Alert

Dashboard read-model for a detected fall/alert. `Alert` is tenant/RLS-scoped and is what REST list/detail and SSE alert frames expose. `alertSeq` is the monotonic SSE replay key used as `Last-Event-ID`; `idempotencyKey` is server-derived for exact duplicate event detection. `originEventId` links alerts derived from the Event SSOT. Target model anchors every alert to `spaceId`; `cameraId` is source metadata and `residentId` is nullable when the person is unknown.

Important fields: target `id`, `alertSeq`, `facilityId`, `spaceId`, `residentId`, `cameraId`, `type`, `probability`, `snapshotKey`, `detectedAt`, `status`, `idempotencyKey`, `originEventId`.

### ResidentStatus

Per-resident current-state read model. State is one of `NORMAL`, `WARNING`, or `FALL`. It also tracks whether the source camera is currently online and the last seen timestamp used by dashboard status badges. Empty-room/unknown-person alerts do not update resident status.

Important fields: `residentId`, `facilityId`, `state`, `lastSeenAt`, `cameraOnline`, `sourceId`.

### Event

Immutable ML event SSOT created by `POST /api/v1/events`. It is tenant/RLS-scoped, append-only for the app role, and deduplicated by a server-derived key from camera, detection timestamp, and type. Backend alert policy may derive `Alert` rows from events; those alerts retain `Alert.originEventId` for traceability.

Important fields: `id`, `facilityId`, `cameraId`, `spaceId`, `type`, `confidence`, `detectedAt`, `dedupKey`, `createdAt`, `modifiedAt`.

### AlertEvent

Backend-owned alert outbox event. It is non-RLS and intentionally excluded from tenant-domain list/query surfaces. `(sourceId, externalEventId)` is the idempotency key for delivery/outbox work. It records the policy decision and prediction metadata used for delivery auditing.

Important fields: `id`, `sourceId`, `externalEventId`, `type`, `detectedAt`, `confidence`, `fallProbability`, `operatingThreshold`, `decision`, `suppressedReason`.

### DeliveryAttempt

Per-channel send record for an `AlertEvent`. It records Kakao send-to-me attempts, retry/terminal failure classification, provider references, and per-recipient fan-out through `recipientUserId`.

Important fields: `id`, `alertEventId`, `recipientUserId`, `channel`, `status`, `attemptCount`, `nextAttemptAt`, `providerReference`, `failureClass`, `terminalReason`, `operatorAction`, `lastError`, `sentAt`.
