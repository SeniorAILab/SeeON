---
slug: prod-db-safe-migrate-deploy
status: done
---

# Production DB Safe Migrate Deploy

## Outcome

Production deploy preserves real data by default: it backs up the database,
validates the backup, applies pending Prisma migrations, and recreates app
services only after DB work succeeds.

## Scope

- Replace default schema reset/seed deploy behavior with `DEPLOY_DB_MODE=migrate`.
- Add guarded `baseline-existing`, `reset-demo`, and `skip` modes.
- Package Prisma CLI and migration assets in the backend image for deploy-time
  one-shot commands only.
- Extend local manual deploy dry-run/live SSH command generation with DB mode
  flags.
- Update runbooks, ADRs, and agent rules.
- Verify locally, commit atomically, push, and open a PR.

## Must Not Have

- No live production deploy during this work.
- No default production `DROP SCHEMA`, demo seed, raw SQL replay, `db push`, or
  app-start migration.
- No mutable `latest`, fallback image tag, fallback branch, or VM-side app image
  build.
