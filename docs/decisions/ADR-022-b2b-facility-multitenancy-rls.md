# ADR-022: B2B Facility Multitenancy — Postgres RLS Default-Deny + orgId Scoping

## Status

Accepted

## Date

2026-06-13

## Context

The eldercare platform serves multiple independent B2B facilities (시설, organizations). Every
resident, camera, alert, and guardian record belongs exclusively to one facility. The core
requirement is **tenant isolation**: org A must never read or write org B's data, and a bug in
application logic must not be sufficient to produce a cross-tenant data leak.

Two broad isolation strategies exist:

1. **Application-layer opt-in filter**: every service method adds a `WHERE org_id = :orgId`
   clause. Isolation depends on every developer remembering the filter; a missing clause silently
   returns all rows from all tenants.
2. **Database-layer structural default-deny**: Postgres Row-Level Security (RLS) makes an
   un-scoped query return zero rows by construction. Isolation is enforced by the database engine,
   not by application discipline.

This project is in DELIBERATE mode (auth/PII/multitenancy) per the plan consensus trace
(ralplan `2026-06-13-1528-f2cf`). Architect raised this as a HIGH-severity blocker (F2) before
execution approval. Critic required it as a non-negotiable hard gate (NR1/NR2).

## Decision

Tenant isolation is implemented as a **database-level default-deny invariant** using Postgres RLS,
with application-level belt-and-suspenders guard:

### 1. `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`

Every tenant table (`Resident`, `Guardian`, `Camera`, `Alert`, `ResidentStatus`) has:


```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <table> FORCE ROW LEVEL SECURITY;
```

`FORCE` ensures the policy applies even to the table owner — a superuser connected as the
table owner bypasses RLS unless FORCE is set.
> **`KakaoIdentity` is excluded from RLS.** Kakao login/onboarding happens before an org
> context is established (`orgId` may be `NULL`). RLS default-deny would block those rows.
> `KakaoIdentity` is gated at the application layer, like `User` and `ServerSession`.
> The five RLS-enforced tables are: `Resident`, `Guardian`, `Camera`, `Alert`, `ResidentStatus`.


### 2. Per-request `app.org_id` GUC via `set_config(..., true)`


The single policy on every tenant table is:

```sql
CREATE POLICY tenant_isolation ON <table>
  USING (org_id = current_setting('app.org_id', true)::text)
  WITH CHECK (org_id = current_setting('app.org_id', true)::text);

```

`current_setting('app.org_id', true)` returns `''` when the GUC is absent (missing →
empty string → `org_id = ''` → false → zero rows). The policy is default-deny without any
explicit `DEFAULT DENY` clause because an un-set GUC produces the `false` comparison.
Note: `orgId` values are CUIDs (`String`), so the cast target is `::text`, not `::uuid`.

A NestJS `PrismaService.withOrgContext()` method sets the GUC inside an interactive
transaction for every request after session validation:

```ts
await tx.$executeRaw`SELECT set_config('app.org_id', ${orgId}, true)`;
```

The third argument `true` means `is_local = true`: the GUC is scoped to the current
**transaction** only and reverts automatically on `COMMIT`/`ROLLBACK`, so
connection-pool reuse cannot bleed a prior tenant's context.

### 3. Dedicated `NOSUPERUSER NOBYPASSRLS` runtime role

The application runtime connection uses a dedicated Postgres role with **no superuser
privilege and `NOBYPASSRLS`**:

```sql
CREATE ROLE fall_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS LOGIN
  PASSWORD '...';
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO fall_app;
```

The `fall_app` role is created idempotently in `backend/prisma/init/01-create-app-role.sql`
(runs via `docker-entrypoint-initdb.d` on first DB init). The migration
(`init_domain_models`) contains only `GRANT` statements — **no `CREATE ROLE`**.

The `fall` superuser role is used for migrations and seeding (`DIRECT_URL`) and is
**not** used at runtime. `DATABASE_URL` for the application process points to `fall_app`.


This separation is the hard gate: a superuser bypasses RLS regardless of policies; a
NOSUPERUSER+NOBYPASSRLS role cannot. Cross-tenant denial tests are valid only when run
**as `fall_app`**, not as the superuser.


### 4. Composite FK coherence

Child tables enforce row-level coherence via composite foreign keys:

- `Camera(orgId, residentId) → Resident(orgId, id)` (requires composite unique on `Resident(orgId, id)`)
- `Alert(orgId, residentId) → Resident(orgId, id)` and `Alert(orgId, cameraId) → Camera(orgId, id)`
- `Guardian(orgId, residentId) → Resident(orgId, id)`
- `ResidentStatus(orgId, residentId) → Resident(orgId, id)`

A row whose child `orgId` mismatches its parent's `orgId` is **unrepresentable** at the
schema level — not merely prevented by application logic.

### 5. Application backstop (Prisma Client extension)

A Prisma Client extension (`$allOperations` hook) throws a typed `MissingTenantContextError`
for any query against a tenant model when no org context is bound in the current execution
scope. This catches misuse (e.g., a forgotten transaction wrapper) before it reaches the DB and
surfaces as a typed boot/runtime error, not a silent zero-row result.

### 6. Seed and migration path under RLS FORCE

Migration scripts run via the privileged `DIRECT_URL` role (superuser `fall` with
`BYPASSRLS`). Seed scripts that must insert multi-tenant data set the GUC explicitly per org
block (`SELECT set_config('app.org_id', '<orgId>', true)`) or run as the privileged role
scoped to seeding only.


## Decision Drivers

- **D1 — Isolation must be structural, not opt-in**: a forgotten filter in one service method
  must not be sufficient to leak cross-tenant data.
- **D2 — Fail-safe default**: an absent org context must produce zero rows, not all rows.
- **D3 — Connection-pool safety**: GUC reset on transaction end (SET LOCAL) prevents
  context bleed across pooled connections.
- **D4 — Role-based enforcement verification**: denial tests must be runnable as the exact
  app runtime role to be valid evidence; superuser tests prove nothing about runtime isolation.
- **D5 — Schema coherence**: composite FKs make cross-org child rows unrepresentable,
  removing a class of bugs that RLS alone cannot prevent (same-DB, wrong-org FK reference).

## Alternatives Considered

### Application-layer opt-in `WHERE org_id = :orgId`

Every service method adds the filter manually. This is the most common pattern in non-RLS
codebases.

- Pros: simple, no Postgres-specific SQL, easy to understand.
- Cons: isolation depends entirely on developer discipline. A single forgotten `WHERE` clause
  leaks all tenant rows. Code review cannot mechanically guarantee 100% coverage. A new service
  author, a new model method, or a `$queryRaw` callsite can each silently break isolation.
- **Rejected**: not structural. The plan Architect consensus (F2 TOP PRIORITY) and Critic hard
  gate (NR1/NR2) explicitly required a DB-level default-deny invariant.

### Separate schemas per tenant (schema-per-org isolation)

Each organization gets its own Postgres schema (`org_<id>.residents`, etc.). RLS is replaced
by schema-level separation.

- Pros: very strong isolation boundary; DDL changes can be per-tenant.
- Cons: requires dynamic schema management, connection-string-per-tenant or `search_path`
  manipulation, and Prisma does not support schema-per-tenant migration natively. Migration
  fan-out (N organizations × M migrations) is operationally complex at PoC stage. Composite
  FK coherence across schemas is impossible.
- **Rejected**: operational overhead disproportionate to PoC scale; Prisma migration tooling
  incompatibility.

### Separate databases per tenant

- Pros: maximum isolation; separate `DATABASE_URL` per org guarantees no accidental joins.
- Cons: connection-pool explosion; Prisma Client instantiation per tenant; migration fan-out
  across N databases; cross-tenant aggregate queries (for operator dashboards) become impossible.
- **Rejected**: does not fit single-operator PoC scale; Prisma tooling assumes single DB.

## Consequences

**Positive:**

- Cross-tenant isolation is a database invariant, verifiable without trusting application code.
  Un-scoped queries return zero rows by construction.
- Composite FKs make cross-org child rows impossible to insert at the schema level.
- The NOSUPERUSER runtime role means a compromised application credential cannot bypass RLS.
- The Prisma extension layer surfaces missing org context as a typed error before the DB, making
  misuse auditable at development time.

**Negative / trade-offs:**

- Two Postgres roles are required (`fall_app` for runtime and the `fall` superuser for
  migrations); `DATABASE_URL` and `DIRECT_URL` must both be configured in the environment.

- Prisma does not model RLS natively; policies and composite FKs are added via raw SQL appended
  to the `init` migration file — a maintenance coupling to watch during future migrations.
- Every tenant query must run inside a transaction that sets `app.org_id` via
  `set_config('app.org_id', orgId, true)` (is_local=true). Bare `$queryRaw` calls that
  bypass `withOrgContext()` are also under the RLS policy but the extension backstop will
  not fire for them; raw SQL authors must set the GUC manually.

- Seeding and testing require explicit GUC setup or the privileged role; naive integration tests
  connected as the superuser give false-positive passes.

## Follow-ups

- Denial test matrix (un-scoped-query denial + cross-tenant 404 for every tenant model) must be
  run **as `fall_app`** as part of AC2/AC10 acceptance gate (P1/P6).
- Composite-FK rejection tests (attempt insert of mismatched `orgId` in child tables) are required
  before the Phase 1 slice is merged.
- Multi-instance scale-out (if needed beyond single-instance MVP) must revisit connection-pool
  GUC propagation — PgBouncer transaction mode resets `SET LOCAL` correctly; statement mode does not.
- Raw `$queryRaw` callsites must be audited per-PR to ensure they do not bypass the interceptor
  without manually setting the GUC.
