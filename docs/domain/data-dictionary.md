# Domain data dictionary

This dictionary names the backend domain objects used by the dashboard, ingest edge, session system, and alert delivery pipeline. Prisma model names and field names are referenced from `backend/prisma/schema.prisma`.

## Naming convention

Prisma model fields are camelCase. Database table and column names are snake_case through `@map` and `@@map`.

Examples:

- `User.orgId` maps to `org_id`.
- `Camera.ingestKeyId` maps to `ingest_key_id`.
- `Alert.alertSeq` maps to `alert_seq`.
- `AlertEvent.externalEventId` maps to `external_event_id`.
- Tables use `@@map`, such as `organizations`, `server_sessions`, `resident_statuses`, `alert_events`, and `delivery_attempts`.

This is the single convention across all tables. New schema fields must not use camelCase database columns.

## Glossary

### Organization

Tenant/facility root. `Organization` owns residents, cameras, guardians, alerts, Kakao identities, and server sessions. It is not itself an RLS tenant-domain list surface; app-layer membership determines which organization a user can act within.

Important fields: `id`, `name`, `businessRegistrationNumber`, `createdAt`.

### User

Authenticated platform user. A user may be unbound from an organization until onboarding completes. `sessionVersion` invalidates existing sessions after account/security changes.

Important fields: `id`, `orgId`, `kakaoId`, `nickname`, `role`, `sessionVersion`.

### KakaoIdentity

Encrypted Kakao OAuth identity/token record used for self-notification. `accessTokenCipher` stores the encrypted access token; refresh tokens are not stored in this build. Alert fan-out looks for users with Kakao identity rows in the target organization.

Important fields: `userId`, `orgId`, `kakaoId`, `accessTokenCipher`, `tokenScope`, `tokenExpiresAt`.

### ServerSession

Server-side session root for JWT/cookie validation, revocation, and SSE re-auth. The browser carries `app_session`; backend validates it against `ServerSession` and `User.sessionVersion`.

Important fields: `id`, `userId`, `orgId`, `expiresAt`, `revokedAt`.

### Resident

Tenant-domain resident shown on the dashboard and linked to cameras, guardians, alerts, and current status.

Important fields: `id`, `orgId`, `name`, `room`.

### Guardian

Emergency contact for a resident. This is resident-linked tenant data; phone is stored in full and masked at the UI/presentation layer when needed.

Important fields: `id`, `orgId`, `residentId`, `name`, `phone`, `relation`.

### Camera

Ingest-capable edge source. `ingestKeyId` is the selector sent with ingest requests; `ingestSecretHash` is the stored SHA-256 hash of the HMAC secret and never stores the plaintext secret. A camera may be assigned to a resident or remain unassigned.

Important fields: `id`, `orgId`, `residentId`, `label`, `ingestKeyId`, `ingestSecretHash`, `lastSeenAt`, `online`.

### Alert

Dashboard read-model for a detected fall/alert. `Alert` is tenant/RLS-scoped and is what REST list/detail and SSE alert frames expose. `alertSeq` is the monotonic SSE replay key used as `Last-Event-ID`; `idempotencyKey` is server-derived for exact duplicate ingest detection.

Important fields: `id`, `alertSeq`, `orgId`, `residentId`, `cameraId`, `type`, `probability`, `snapshotKey`, `detectedAt`, `status`, `idempotencyKey`.

### ResidentStatus

Per-resident current-state read model. State is one of `NORMAL`, `WARNING`, or `FALL`. It also tracks whether the source camera is currently online and the last seen timestamp used by dashboard status badges.

Important fields: `residentId`, `orgId`, `state`, `lastSeenAt`, `cameraOnline`, `sourceId`.

### AlertEvent

Backend-owned alert outbox event. It is non-RLS and intentionally excluded from tenant-domain list/query surfaces. `(sourceId, externalEventId)` is the idempotency key for delivery/outbox work. It records the policy decision and prediction metadata used for delivery auditing.

Important fields: `id`, `sourceId`, `externalEventId`, `type`, `detectedAt`, `confidence`, `fallProbability`, `operatingThreshold`, `decision`, `suppressedReason`.

### DeliveryAttempt

Per-channel send record for an `AlertEvent`. It records Kakao send-to-me attempts, retry/terminal failure classification, provider references, and per-recipient fan-out through `recipientUserId`.

Important fields: `id`, `alertEventId`, `recipientUserId`, `channel`, `status`, `attemptCount`, `nextAttemptAt`, `providerReference`, `failureClass`, `terminalReason`, `operatorAction`, `lastError`, `sentAt`.
