---
slug: pnpm-dev-command-taxonomy-backend-db
status: done
author: codex
date: 2026-07-01
---

# pnpm-dev-command-taxonomy-backend-db Spec

## Problem
Daily local development commands are not MECE. Frontend, backend, and ML are the three high-level runtime owners, but the current root scripts expose DB and Prisma as top-level concerns and split ML into API/worker names beside the runtime owners. Backend also cannot be started through one explicit command that owns its DB dependency and, when requested, resets the local DB before Nest starts.

## Requirements
- Keep the daily local mental model to `pnpm dev:front`, `pnpm dev:backend`, and `pnpm dev:ml`.
- Add a clearly named backend fresh-start command that brings up DB, resets the local Prisma database, regenerates Prisma Client, seeds, and starts the backend.
- Keep lower-level commands available only under their owning namespace, for example `dev:backend:app`, `dev:ml:api`, `dev:ml:worker`, `backend:db:*`, and `backend:prisma:*`.
- Guard destructive DB reset so it fails for prod-looking env files and non-local `DATABASE_URL` / `DIRECT_URL` hosts.
- Update canonical onboarding/runtime docs to reflect the new command shape.
- Verify with command-contract tests, DB guard tests, and package-script smoke checks.

## Non-Goals
- Do not change Prisma schema, migration files, seed semantics, or application data model.
- Do not put DB reset logic inside Nest lifecycle hooks.
- Do not introduce new npm dependencies or fake E2E harnesses.
- Do not make ML worker auto-start behind `dev:ml`; the worker remains a component command because it requires local camera/model config.
