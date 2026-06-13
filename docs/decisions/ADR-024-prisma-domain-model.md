# ADR-024: Prisma Domain Model — Organization, Auth, Resident, Camera, Alert, ResidentStatus

## Status

Accepted

## Date

2026-06-13

## Context

The production frontend feature (issue #102, ralplan `2026-06-13-1528-f2cf`) requires a Postgres
schema that can express:

- **Multi-tenant B2B structure**: organizations (facilities) owning all other entities (ADR-022).
- **Kakao OAuth identity**: a user can log in with a Kakao account; identity is separate from
  the application user record (ADR-023).
- **Revocable server sessions**: the session guard needs a backend record for revocation (ADR-023).
- **Residents and guardians**: the people being monitored and their emergency contacts.
- **Cameras**: IoT devices that ingest fall alerts; each camera belongs to an org and optionally
  to a resident.
- **Alert event log**: an append-only log of fall-detection alerts with a stable, monotonically
  increasing sequence number for SSE replay (ADR-025).
- **Resident current-state read model**: a denormalized per-resident status view for fast
  dashboard rendering without scanning the alert log.
- **Row-level isolation**: every tenant table must carry `orgId` for RLS policy binding (ADR-022).

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
| `ingestKeyId` | `String` | HMAC key selector (not a secret) |
| `ingestSecretHash` | `String` | Bcrypt/argon2 hash of the HMAC secret |
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
| `idempotencyKey` | `String` | Server-derived: `hash(cameraId + detectedAt + type)`; unique within org |
| `createdAt` | `DateTime @default(now())` | |

Indexes: `@@index([orgId, alertSeq])` (SSE replay query); `@@unique([orgId, idempotencyKey])`.

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
| `source` | `String?` | Camera ID that produced the last state change |
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
- RLS policy `tenant_isolation` (`USING (org_id = current_setting('app.current_org_id', TRUE)::uuid)`) per tenant table.
- Composite FK constraints for `Guardian`, `Camera`, `Alert`, `ResidentStatus`.
- `CREATE ROLE app_runtime …` (idempotent `DO $$ IF NOT EXISTS $$` block).

Migration/seed use the privileged `DATABASE_MIGRATE_URL`; the application runtime uses
`DATABASE_URL` → `app_runtime` role.

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
  FK coherence (ADR-022).
- **D6 — ServerSession for revocation**: plain JWT expiry is not revocation. `ServerSession` gives
  the session guard a real record to invalidate, enabling real logout semantics (ADR-023).

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
- **Rejected**: wall-clock ordering is insufficient for SSE replay correctness (ADR-025).

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
  (reinforces ADR-022).
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
