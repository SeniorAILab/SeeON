---
slug: backend-local-db-dev-workflow
title: "Backend Local DB Dev Workflow"
type: plan
date: 2026-07-01
---

# Backend Local DB Dev Workflow Plan

## Decisions

- Root `dev:backend` becomes the practical backend developer entrypoint:
  ensure local env, start DB, generate Prisma Client, apply `migrate dev`, then
  run backend `start:dev`.
- Root `dev:local` and `dev:local:reset` run the local full-stack loop with a
  guarded destructive DB reset before starting backend and front.
- Backend package `start:dev` stays raw Nest watch mode.
- Reset/migrate/seed stays in scripts before app startup, never in NestJS
  lifecycle.

## Steps

1. Add local env parsing/guard helpers under `scripts/dev/`.
2. Add `scripts/db/reset-local.mjs` for guarded reset/generate/seed.
3. Add `scripts/dev/dev-local.mjs` for `backend`, `local`, and dry-run flows.
4. Wire root package scripts for `dev:backend`, `dev:local`,
   `dev:local:reset`, `db:reset:local`, and `smoke:backend:no-db`.
5. Add backend no-DB smoke script using existing route-versioning test.
6. Update README and backend onboarding docs with the command contract.
7. Verify dry-runs, no-DB smoke, typecheck/lint or targeted syntax checks.

## Verification

Run:

```bash
pnpm dev:backend -- --dry-run
pnpm dev:local -- --dry-run
pnpm dev:local:reset -- --dry-run
pnpm db:reset:local -- --dry-run
pnpm smoke:backend:no-db
```

Then run the smallest applicable static checks for changed files.
