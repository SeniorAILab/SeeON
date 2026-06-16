# ADR-002: PostgreSQL Everywhere (Dev and Prod)

## Status

Accepted

## Date

2026-06-07

## Context

The project lead comes from a Java/Spring background where the H2 in-memory database is the
standard choice for local development: it requires no local installation, starts instantly inside
the JVM, and is discarded the moment the process exits. The natural question when setting up this
NestJS/Prisma backend was whether the same split could be replicated — SQLite (or some in-memory
variant) for development, PostgreSQL for production — to remove the Docker prerequisite for every
contributor.

Prisma closes that option at the schema level. The `datasource` block in
`backend/prisma/schema.prisma` accepts a single `provider` value that is baked into **both** the
schema file and every generated migration SQL file. The generated SQL uses provider-specific
syntax: PostgreSQL migrations use `CREATE TABLE … SERIAL`, JSON operators, `ILIKE`, and so on,
while SQLite migrations use a different DDL dialect. Prisma's multi-provider array syntax
(`provider = ["postgresql", "sqlite"]`) was introduced experimentally and has since been
deprecated; it is not a supported path. Unlike a Hibernate dialect, which is a pure runtime
switch, a Prisma provider change invalidates the entire migration history.

The consequence: choosing different providers per environment does not mean "same schema, different
engine." It means two diverging migration histories, two sets of generated SQL, and a real class of
bugs that only surface in production — exactly the environment parity problem the split was meant
to avoid.

There is also no Prisma-native in-memory provider that is semantically equivalent to H2. SQLite
opened from `:memory:` still differs from PostgreSQL in type coercions, JSON handling, and
constraint semantics.

## Decision

**Use PostgreSQL for every environment.** Development and production differ only by the value of
`DATABASE_URL`.

Concretely:

- `backend/prisma/schema.prisma` declares `provider = "postgresql"` with
  `url = env("DATABASE_URL")`. The comment inside that file explicitly records the reason:
  _"Prisma bakes `provider` into the schema AND migrations; engine is NOT runtime-swappable
  (unlike Hibernate dialects). Keep provider = postgresql."_

- Local development PostgreSQL is provided by Docker Compose. `docker-compose.yml` runs
  `postgres:17-alpine` as the `db` service (container name `eldercare-fall-db`), with defaults
  user `fall`, password `fall`, database `fall_dev`, published on host port `5432`.

- `backend/.env.example` ships a ready-to-use `DATABASE_URL` that matches those defaults:
  ```
  DATABASE_URL="postgresql://fall:fall@localhost:5432/fall_dev?schema=public"
  ```
  Contributors copy this file to `.env.development` (or `.env.production`) and never need to
  edit the connection string for the vanilla local setup.

- `backend/src/app.module.ts` loads the correct env file via NestJS `ConfigModule`:
  ```ts
  ConfigModule.forRoot({
    isGlobal: true,
    envFilePath: `.env.${process.env.NODE_ENV ?? 'development'}`,
  })
  ```
  Switching environments is a matter of setting `NODE_ENV`; the database wiring follows
  automatically.

- Only `.env.example` is committed to version control. Actual env files (`.env.development`,
  `.env.production`, etc.) are gitignored to prevent credentials from being stored in the repo.

## Alternatives Considered

### SQLite for dev, PostgreSQL for prod

The intuitive H2-style split. Rejected because Prisma's `provider` is compiled into every
generated migration file. Running `prisma migrate dev` against SQLite and `prisma migrate deploy`
against PostgreSQL produces two diverging sets of migrations. SQL that is valid in one dialect
(e.g., `TEXT` columns treated as unlimited in SQLite vs. typed `VARCHAR`/`TEXT` in Postgres, or
JSON operators) fails or silently behaves differently in the other. The very goal of using
migrations — a single, auditable schema history — is defeated.

### An in-memory database equivalent to H2

There is no Prisma provider for a true in-memory relational store. SQLite can be opened from
`:memory:`, but as noted above the provider lock still applies, and SQLite-in-memory differs from
PostgreSQL in enough semantic details (type coercion, `RETURNING` support, constraint deferral) to
constitute a different test environment, not a zero-overhead substitute.

### Maintaining two schema.prisma files, one per provider

Physically possible but operationally untenable: every model change must be applied to two schema
files, two migration directories, and two generated clients. The overhead grows with schema
complexity, and the failure mode (one file drifts) is silent until production. This approach would
also require a custom build step to select the active schema, adding tooling complexity with no
benefit over the chosen approach.

### Managed cloud PostgreSQL for dev (e.g., Supabase free tier)

Removes the Docker prerequisite but replaces it with a network dependency and an external account.
Offline development, CI environments without egress, and contributor onboarding all become harder.
A local container is more reproducible and faster to provision.

## Consequences

**Positive:**

- True dev/prod parity: the same provider, the same migration history, the same SQL dialect in
  every environment. A migration tested locally will behave identically when deployed.
- One migration history under `backend/prisma/migrations/` — no branching, no reconciliation
  step before releases.
- Local setup is deterministic: `docker compose up -d db` brings up a known image
  (`postgres:17-alpine`) with known defaults; no external accounts or network required.

**Negative / trade-offs:**

- Docker is a hard prerequisite for local development. Contributors without Docker installed
  cannot run the backend without pointing `DATABASE_URL` at an external Postgres instance.
- Container startup adds a few seconds to the first `docker compose up`; subsequent starts reuse
  the `pgdata` named volume and are fast.
- The `pgdata` volume persists between runs by design, which mirrors production durability but
  means developers must explicitly `docker compose down -v` to get a clean-slate database.
- Real credential files must never be committed; the gitignore discipline around `*.env.*` (except
  `.env.example`) must be maintained.
