# ADR-031: Prisma Domain Model — Organization, Auth, Resident, Camera, Alert, ResidentStatus

## Status

Accepted

> **Split context (PR #105 fan-out, issue #102):** This is the **#105-1 data+RLS foundation** slice. RLS is folded into this foundation. Cross-references to **ADR-032** (auth/session) and **ADR-034** (SSE transport) are forward references to upcoming #105 slices and are not yet present in the visible corpus. Renumbered from the original #105 branch (ADR-024) to ADR-031 to avoid collision with the post-#104 ADR-024 (ml demo/product surface boundary).

## Date

2026-06-13

## Context

The production frontend feature (issue #102, ralplan `2026-06-13-1528-f2cf`) requires a Postgres
schema that can express:

- **Multi-tenant B2B structure**: organizations (facilities) owning all other entities (ADR-031).
- **Kakao OAuth identity**: a user can log in with a Kakao account; identity is separate from
  the application user record (ADR-032).
- **Revocable server sessions**: the session guard needs a backend record for revocation (ADR-032).
- **Residents and guardians**: the people being monitored and their emergency contacts.
- **Cameras**: IoT devices that ingest fall alerts; each camera belongs to an org and optionally
  to a resident.
- **Alert event log**: an append-only log of fall-detection alerts with a stable, monotonically
  increasing sequence number for SSE replay (ADR-034).
- **Resident current-state read model**: a denormalized per-resident status view for fast
  dashboard rendering without scanning the alert log.
- **Row-level isolation**: every tenant table must carry `orgId` for RLS policy binding (ADR-031).

ADR-002 established PostgreSQL as the single provider. This ADR defines the concrete domain model
that replaces the scaffolded placeholder schema (`AnalysisJob`, `Prediction`) in
`backend/prisma/schema.prisma`.

## Decision

The following Prisma models form the initial domain schema, initialized in a single migration
`init_domain_models`.

### Root tenant table

**`Organization`** — one row per facility; no RLS (gated in app code by membership check).

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String @id @default(cuid())` | CUID primary key |
| `name` | `String` | Facility display name |
| `businessRegistrationNumber` | `String?` | Nullable; not required for MVP |
| `createdAt` | `DateTime @default(now())` | |

### Auth and identity tables

**`User`** — application user; `orgId` nullable until onboarding completes.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String @id @default(cuid())` | |
| `orgId` | `String?` | FK → Organization; null = pre-onboarding |
| `kakaoId` | `String @unique` | Kakao user ID (stable identifier) |
| `email` | `String?` | Nullable; not required by Kakao profile scope |
| `nickname` | `String` | From Kakao profile |
| `role` | `Role` | Enum: `OWNER`, `ADMIN` |
| `sessionVersion` | `Int @default(0)` | Increment for global session revoke |
| `createdAt` | `DateTime @default(now())` | |

**`KakaoIdentity`** — external identity record; one per user per Kakao account.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String @id @default(cuid())` | |
| `userId` | `String @unique` | FK → User (1:1 this build) |
| `orgId` | `String?` | FK → Organization; `NULL` before/during onboarding |
| `kakaoId` | `String` | Kakao user ID (for lookup) |
| `tokenExpiresAt` | `DateTime?` | Nullable; tokens not stored this build |
| `createdAt` | `DateTime @default(now())` | |

**`ServerSession`** — server-side session record; enables real revocation and SSE re-auth.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String @id @default(cuid())` | Used as `sessionId` claim in JWT |
| `userId` | `String` | FK → User |
| `orgId` | `String?` | Denormalized snapshot of user's orgId at session mint time |
| `expiresAt` | `DateTime` | Absolute expiry; session guard rejects after this |
| `revokedAt` | `DateTime?` | Set by logout; session guard rejects if non-null |
| `createdAt` | `DateTime @default(now())` | |

### Tenant tables (all carry `orgId`, all under RLS)

**`Resident`** — person being monitored.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String @id @default(cuid())` | |
| `orgId` | `String` | FK → Organization |
| `name` | `String` | |
| `room` | `String?` | Room/ward label |
| `createdAt` | `DateTime @default(now())` | |

Composite unique: `@@unique([orgId, id])` — required for composite FK targets in child tables.

**`Guardian`** — emergency contact for a resident.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String @id @default(cuid())` | |
| `residentId` | `String` | |
| `orgId` | `String` | Denormalized; FK composite `(orgId, residentId) → Resident(orgId, id)` |
| `name` | `String` | |
| `phone` | `String` | Stored in full; masked in UI layer |
| `relation` | `String?` | e.g., "son", "daughter" |
| `createdAt` | `DateTime @default(now())` | |

**`Camera`** — IoT camera device that posts ingest events.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String @id @default(cuid())` | |
| `orgId` | `String` | FK → Organization |
| `residentId` | `String?` | Composite FK `(orgId, residentId) → Resident(orgId, id)` |
| `label` | `String` | Human-readable label; unique within org |
| `lastSeenAt` | `DateTime?` | Updated on ingest; drives online indicator |
| `online` | `Boolean @default(false)` | Computed from lastSeenAt staleness |
| `createdAt` | `DateTime @default(now())` | |

Composite unique: `@@unique([orgId, id])` (composite FK target); `@@unique([orgId, label])`.

**`Alert`** — append-only fall detection event record.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String @id @default(cuid())` | CUID PK (stable reference) |
| `alertSeq` | `BigInt @default(autoincrement())` | Global bigserial; used as SSE `id` field and `Last-Event-ID` |
| `orgId` | `String` | FK → Organization |
| `residentId` | `String` | Composite FK `(orgId, residentId) → Resident(orgId, id)` |
| `cameraId` | `String?` | Composite FK `(orgId, cameraId) → Camera(orgId, id)` |
| `type` | `String` | e.g., `"FALL"` |
| `probability` | `Float` | ML model confidence score |
| `snapshotKey` | `String?` | Internal org-scoped storage key (never an edge URL) |
| `detectedAt` | `DateTime` | Timestamp from ingest payload |
| `status` | `AlertStatus @default(NEW)` | Enum: `NEW`, `ACKED`, `RESOLVED` |
| `ackedById` | `String?` | Lifecycle audit: session user who acknowledged. Nullable FK → `users(id)` (`onDelete: SetNull, onUpdate: Cascade`). |
| `ackedAt` | `DateTime?` | When acknowledged (NEW→ACKED). |
| `resolvedById` | `String?` | Lifecycle audit: session user who resolved. Nullable FK → `users(id)` (SetNull/Cascade). |
| `resolvedAt` | `DateTime?` | When resolved (ACKED→RESOLVED). |
| `idempotencyKey` | `String` | Server-derived: `hash(cameraId + detectedAt + type)`; unique within org |
| `createdAt` | `DateTime @default(now())` | |

Indexes: `@@index([orgId, alertSeq])` (SSE replay query); `@@unique([orgId, idempotencyKey])`.

**Lifecycle audit (NEW→ACKED→RESOLVED).** `ackedById/ackedAt/resolvedById/resolvedAt` record who/when for each transition. The actor is the authenticated session user (`req.user.id`), never client-supplied. The actor columns are **simple nullable FKs to `users(id)`** (`onDelete: SetNull, onUpdate: Cascade`), not composite facility-scoped FKs: `User` is a non-RLS identity root with a nullable `facilityId`, so a composite tenant FK would require an auth-domain migration. Same-facility integrity is an **app-layer guarantee** — `SessionGuard` + `RequireFacilityGuard` bind the actor's facility and the writer mutates the alert inside the request facility context. Added indexes: `@@index([facilityId, status, alertSeq])` (status-filtered dashboard queries), `@@index([ackedById])`, `@@index([resolvedById])`. Because the columns are added to the already RLS-protected `alerts` table, they **inherit the existing tenant policy — no new RLS policy is required**. A per-action history table (`AlertResponse`) is intentionally **deferred** until multi-action-per-alert history is a confirmed product requirement; the denormalized columns cover the current acknowledge/resolve lifecycle. Transitions are owned by `AlertWriterService` (single serialized Alert mutation queue) and broadcast as a live-only `event: alert-updated` SSE frame (`docs/rules/realtime-sse-convention.md`).

`alertSeq` is a `bigserial` at the DB level, implemented via Prisma as `@default(autoincrement())`
on a `BigInt` field. The sequence is **global** (not per-org) so ordering is total across the
database; SSE replay filters by `orgId` using the index on `(orgId, alertSeq)`.

**`ResidentStatus`** — current-state read model; one row per resident; updated on each ingest.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String @id @default(cuid())` | |
| `residentId` | `String @unique` | FK → Resident |
| `orgId` | `String` | Denormalized for RLS |
| `state` | `ResidentState @default(NORMAL)` | Enum: `NORMAL`, `WARNING`, `FALL` |
| `lastSeenAt` | `DateTime?` | Timestamp of last alert |
| `cameraOnline` | `Boolean @default(false)` | Snapshot of source camera online state |
| `sourceId` | `String?` | Composite FK `(orgId, sourceId) → Camera(orgId, id)` |
| `updatedAt` | `DateTime @updatedAt` | |

### Enums

```prisma
enum Role        { OWNER ADMIN }
enum AlertStatus { NEW ACKED RESOLVED }
enum ResidentState { NORMAL WARNING FALL }
```

### Migration strategy

The initial migration `init_domain_models` is generated by `prisma migrate dev`. A raw SQL block
is appended to the migration file to add items Prisma cannot model natively:

- `ALTER TABLE … ENABLE ROW LEVEL SECURITY; FORCE ROW LEVEL SECURITY;` for every tenant table.
- RLS policy `tenant_isolation` (`USING ("orgId" = current_setting('app.org_id', true)::text)`) per tenant table.

- Composite FK constraints for `Guardian`, `Camera`, `Alert`, `ResidentStatus`.

- `CREATE ROLE fall_app …` (idempotent `DO $$ IF NOT EXISTS $$` block) is in
  `backend/prisma/init/01-create-app-role.sql`, **not** in the migration — the migration
  contains only `GRANT` statements for `fall_app`.

Migration/seed use the privileged `DIRECT_URL` (`fall` superuser); the application runtime
uses `DATABASE_URL` → `fall_app` role.

## Decision Drivers

- **D1 — Single init migration**: all domain models land in one migration to avoid a proliferation
  of small migrations during PoC. Future feature migrations add models incrementally.
- **D2 — alertSeq as the SSE identity**: a monotonically increasing integer is required as the
  SSE `id` field to support `Last-Event-ID` replay. A CUID PK cannot serve this role because CUID
  order does not equal insert order.
- **D3 — ResidentStatus as read model**: querying the alert log to derive current resident state
  for every dashboard render is a full-scan per resident per render. A denormalized read model
  (`ResidentStatus`) is updated on each ingest write and serves the dashboard in O(1).
- **D4 — KakaoIdentity separate from User**: allows future multi-provider auth without a User
  schema migration. The current 1:1 relationship is a constraint, not a structural limit.
- **D5 — orgId denormalization in child tables**: RLS policy requires `org_id` on every tenant
  table row. Denormalizing avoids a join-to-parent in the policy expression and enables composite
  FK coherence (ADR-031).
- **D6 — ServerSession for revocation**: plain JWT expiry is not revocation. `ServerSession` gives
  the session guard a real record to invalidate, enabling real logout semantics (ADR-032).

## Alternatives Considered

### Single `alertSeq` counter per org (not global)

Use a per-org sequence (`org_id, seq` composite) so `alertSeq` values are per-tenant.

- Pros: smaller integers per org; conceptually cleaner.
- Cons: Postgres `SEQUENCE` objects are global; a per-org counter requires either a separate
  sequence per org (DDL change per new org at runtime) or an advisory-lock counter table. A global
  bigserial is simpler and the total order is still filterable by `(orgId, alertSeq)`.
- **Rejected**: implementation complexity outweighs the aesthetic benefit; bigint has sufficient
  range (9.2 × 10¹⁸ rows).

### Alert buffer / staging table instead of append-only event log

A separate `AlertBuffer` (ephemeral, ring-buffer semantics) for recent alerts, with the log
being write-only for archival.

- Pros: dashboard queries hit a small, bounded table.
- Cons: two tables to write consistently (atomic write + buffer update); SSE `Last-Event-ID`
  replay requires the full log anyway; `ResidentStatus` read model already solves the
  dashboard-latency concern without a buffer.
- **Rejected**: unnecessary complexity; `ResidentStatus` + `(orgId, alertSeq)` index is sufficient.

### Embedded alertSeq in ResidentStatus (no separate Alert table alertSeq)

Store the last `alertSeq` only in `ResidentStatus`, derive ordering from `Alert.createdAt`.

- Pros: simpler schema.
- Cons: `createdAt` ordering is wall-clock, not insert-order; concurrent inserts in the same
  millisecond are unordered. The SSE `Last-Event-ID` protocol requires a stable monotonic id.
  `Alert.alertSeq` (bigserial) provides exactly that.
- **Rejected**: wall-clock ordering is insufficient for SSE replay correctness (ADR-034).

### Store Kakao access/refresh tokens in KakaoIdentity

Persist Kakao `access_token` and `refresh_token` for future Kakao API calls.

- Pros: ready for Kakao messaging dispatch (#96) without a re-auth step.
- Cons: tokens are credentials; storing them requires encryption at rest, secret rotation
  strategy, and scope audit. Out of scope for this build.
- **Deferred**: `tokenExpiresAt` and placeholder nullable token fields are in the schema; actual
  token storage is a future migration (to be addressed in #96 ADR).

## Consequences

**Positive:**

- All domain entities land in one coherent migration; subsequent feature migrations are additive.
- `alertSeq` (bigserial) gives SSE a stable, replay-compatible event identity without a separate
  sequence mechanism.
- `ResidentStatus` decouples dashboard read latency from alert log scan depth.
- Composite FKs + composite uniques make cross-org child rows unrepresentable at the DB level
  (reinforces ADR-031).
- `KakaoIdentity` separation is future-proof for multi-provider auth.

**Negative / trade-offs:**

- RLS policies and composite FKs are raw SQL appended to the Prisma migration; any schema
  refactoring that recreates tables must also recreate policies and FKs.
- `alertSeq` as `BigInt` in Prisma serializes to JavaScript `BigInt` by default — API responses
  must serialize `alertSeq` as a string (JSON does not support 64-bit integers natively) and the
  SSE client must parse it accordingly.
- `ResidentStatus` is a write-path dependency on every alert ingest: the ingest transaction must
  update `ResidentStatus` atomically with the alert insert. A failed update leaves state stale
  until the next ingest.
- `ingestSecretHash` in `Camera` stores only the hash (not the plaintext secret). Initial setup
  (camera provisioning) must communicate the secret out-of-band; there is no API to retrieve it
  after creation.

## Follow-ups

- `prisma migrate dev --name init_domain_models` must succeed with the appended raw SQL block;
  verify via `pnpm prisma:migrate` in CI (AC10).
- `alertSeq` serialization: ensure all API responses that include `alertSeq` use `String`
  serialization (add a Prisma Client extension or NestJS interceptor to coerce `BigInt → String`).
- Future: when the `Guardian.phone` field is surfaced in the API, the serialization layer must
  apply masking (last 4 digits only) — this is a presentation concern, not a storage concern.
- `ResidentStatus` decay (state returning to `NORMAL` after a timeout if no new fall detected)
  is a business logic concern deferred to Phase 3 implementation.

## Changelog

- 2026-06-27: Add `Alert` lifecycle audit columns `ackedById`/`ackedAt`/`resolvedById`/`resolvedAt` (nullable FK → `users(id)`, `onDelete: SetNull`, `onUpdate: Cascade`) plus indexes `([facilityId, status, alertSeq])`, `([ackedById])`, `([resolvedById])` for the NEW→ACKED→RESOLVED acknowledge/resolve lifecycle (migration `alert_lifecycle_audit`). Actor is the session user; same-facility is an app-layer guarantee; no new RLS policy. A dedicated action-log table is deferred. Transitions are owned by `AlertWriterService` and broadcast as a live-only `event: alert-updated` SSE frame.
