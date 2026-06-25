# ADR-073 - Safe production DB migrations

- Status: Accepted
- Date: 2026-06-25
- Refines: ADR-062, ADR-063, ADR-072

## Context

The Naver Cloud VM deploy path previously reset the `public` schema, replayed
every committed Prisma migration SQL file with `psql`, then ran the demo seed.
That was useful for demo rebuilds, but it is not safe once production data must
be preserved. Raw SQL replay also bypasses Prisma's `_prisma_migrations` ledger,
so the first switch to Prisma-managed production migrations needs a guarded
baseline path for existing databases.

Prisma's production command is `prisma migrate deploy`: it applies pending
migrations, does not reset the database, and does not rely on a shadow database.
Postgres `pg_dump -Fc` plus `pg_restore --list` gives this single-host stack a
small, inspectable pre-migration backup gate.

## Decision

1. Production deploy defaults to `DEPLOY_DB_MODE=migrate`.
2. `migrate` pulls explicit SHA-tagged images, starts/keeps `db` healthy, takes
   a `pg_dump -Fc` backup, validates it with `pg_restore --list`, syncs the app
   role, runs `prisma migrate deploy`, then recreates backend/front.
3. The backend image includes Prisma CLI and `backend/prisma/**` so deploy
   tooling can run one-shot `prisma migrate deploy` and
   `prisma migrate resolve` commands.
4. The NestJS app process never runs migrations at startup.
5. `DEPLOY_DB_MODE=baseline-existing` is a guarded one-time transition for a
   database with existing domain tables but no `_prisma_migrations` rows. It
   requires `ALLOW_PRISMA_BASELINE=1`, marks existing migration directories as
   applied with `prisma migrate resolve --applied`, then runs
   `prisma migrate deploy`.
6. `DEPLOY_DB_MODE=reset-demo` preserves the old destructive demo rebuild path
   only when
   `ALLOW_DESTRUCTIVE_DB_RESET=I_UNDERSTAND_THIS_WIPES_PUBLIC_SCHEMA`.
7. `DEPLOY_DB_MODE=skip` is available for image-only redeploy or rollback.
8. A host-side deploy lock prevents concurrent backup, migration, baseline, or
   reset operations.
9. After the schema is current in `migrate`, `baseline-existing`, and `reset-demo`,
   the deploy runs an idempotent super-admin bootstrap
   (`dist/prisma/seed-super-admin.js`) driven by `SUPER_ADMIN_EMAIL` /
   `SUPER_ADMIN_PASSWORD`. It is a no-op when no password is set, never seeds demo
   data, and only ensures one email/password `SUPER_ADMIN` exists so a migrated
   database is operable. It is a different layer from the demo seed and from the
   Kakao operator promotion tool (`scripts/bind-demo-users.ts`).

## Consequences

- Default production deploy no longer drops/recreates `public`, raw-replays all
  migration SQL files, or runs the demo seed.
- Operators get an explicit first-transition path for the current raw-replayed
  production database.
- A failed backup, backup validation, baseline, or migration aborts the deploy
  before backend/front are recreated in safe modes.
- Prisma CLI is present in the backend image, but only deploy tooling may use it
  for one-shot migration commands.
- This is not a substitute for full PITR/WAL archiving. It is the smallest safe
  step for the current single-host stack.
- A freshly migrated database can be made operable without the demo seed by setting
  `SUPER_ADMIN_PASSWORD`; the bootstrap is idempotent and does not churn the super
  admin's sessions on repeated deploys.

## Alternatives Considered

- **Keep raw SQL replay but stop resetting first.** Rejected: it still bypasses
  Prisma's migration ledger and cannot safely know what is pending.
- **Run migrations at app startup.** Rejected: startup should not own schema
  mutation or block multiple app instances on migration concurrency.
- **Create a separate migrate image.** Rejected: the current topology already has
  the backend runtime dependencies and Prisma schema; a separate image adds
  operational surface without improving safety.
- **Use `prisma db push`.** Rejected: it is not the production migration history
  contract for this repo.

## Changelog

- 2026-06-25: Accepted. Added the env-driven idempotent super-admin bootstrap step to the migrate/baseline-existing/reset-demo deploy paths (no-op without `SUPER_ADMIN_PASSWORD`).
