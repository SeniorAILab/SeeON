---
slug: backend-local-db-dev-workflow
title: "Backend Local DB Dev Workflow"
type: spec
date: 2026-07-01
---

# Backend Local DB Dev Workflow

## Problem

Local backend development currently makes the backend command look standalone
even though the real runtime requires `.env.local`, PostgreSQL, Prisma Client,
and current migrations/seed data. Developers also want to iterate against a
real local Postgres database rather than an in-memory substitute.

## Goal

Make the local development commands honest and repeatable:

- `pnpm dev:backend` starts the DB dependency, prepares Prisma, and then starts
  the backend watch server.
- `pnpm dev:local` starts a full local native dev loop after wiping and
  rebuilding the guarded local DB.
- `pnpm dev:local:reset` is the explicit spelling of the same destructive
  full-local reset loop.

## Requirements

- Use real local PostgreSQL, not an in-memory database.
- Keep destructive reset outside NestJS app lifecycle hooks.
- Guard destructive reset so it can only run against local development DB URLs.
- Keep backend package `start:dev` as the raw Nest watch command to avoid
  package-script recursion.
- Preserve production migration behavior: production remains committed
  migrations via deploy tooling, not app startup.
- Do not remove or squash existing Prisma migration directories in this work.

## Non-goals

- No migration squash/baseline.
- No `db push` as the canonical schema workflow.
- No production env/deploy command changes.
- No fake E2E naming for provider-overridden no-DB smoke tests.

## Acceptance

- Missing or unsafe env input fails before Docker/Prisma destructive commands.
- `pnpm dev:backend -- --dry-run` shows DB up, Prisma generate/migrate, backend
  start, and no reset.
- `pnpm dev:local -- --dry-run` shows DB up, guarded reset, backend start, and
  front start.
- `pnpm dev:local:reset -- --dry-run` matches the destructive local reset loop.
- `pnpm smoke:backend:no-db` validates backend route wiring with a dead DB URL.
