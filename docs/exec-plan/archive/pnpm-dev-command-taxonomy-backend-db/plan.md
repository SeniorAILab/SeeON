---
slug: pnpm-dev-command-taxonomy-backend-db
status: done
author: codex
date: 2026-07-01
---

# pnpm-dev-command-taxonomy-backend-db Plan

## Decision
Use owner-first pnpm scripts:
- High-level daily commands: `dev:front`, `dev:backend`, `dev:backend:fresh`, `dev:ml`.
- Backend internals: `dev:backend:app`, `backend:db:*`, `backend:prisma:*`.
- ML internals: `dev:ml:api`, `dev:ml:worker`, `dev:ml:demo`.

This follows pnpm workspace practice by keeping root scripts as orchestration and delegating package-owned scripts through `pnpm --filter`. It follows Prisma practice by keeping `prisma migrate reset` as explicit dev-only tooling outside Nest startup.

## Steps
1. Add failing Node tests for the root command contract and the local DB guard behavior.
2. Implement a small dependency-free DB guard script that parses `.env.local` and rejects prod env files or non-local DB hosts.
3. Rework root `package.json` scripts into the owner-first taxonomy.
4. Add backend package reset primitive that runs the guard, `prisma migrate reset --force`, generate, and seed.
5. Update README, AGENTS, ML README, architecture/runtime docs, and relevant script messages to the new command names.
6. Run the targeted tests, package-script smoke checks, and typecheck/lint where relevant.
7. Run a review pass on the diff and address blockers before final response.

## Acceptance
- `node --test scripts/dev/*.test.mjs` passes.
- `pnpm run dev:front`, `pnpm run dev:backend`, `pnpm run dev:backend:fresh`, and `pnpm run dev:ml` resolve to the intended scripts.
- `pnpm run backend:db:reset` cannot run against non-local hosts or prod env filenames.
- User-facing docs describe DB as backend-owned and no longer require daily frontend/ML users to manage DB manually.
