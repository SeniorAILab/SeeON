# Local Dev Command Taxonomy

## Current rule

Daily local development has three owner-level commands:

```bash
pnpm dev:front
pnpm dev:backend
pnpm dev:ml
```

Backend owns its local database dependency. `pnpm dev:backend` starts local PostgreSQL before Nest. `pnpm dev:backend:fresh` is the explicit destructive path: it starts local PostgreSQL, verifies the env file is `.env.local` and all Prisma DB URLs point to localhost, runs `prisma migrate reset --force`, regenerates Prisma Client, seeds, and starts Nest.

Lower-level commands must stay under the owning surface:

```bash
pnpm dev:backend:app
pnpm backend:db:up
pnpm backend:db:reset
pnpm backend:prisma:migrate
pnpm backend:prisma:generate
pnpm backend:prisma:seed
pnpm dev:ml:api
pnpm dev:ml:worker
pnpm dev:ml:demo
```

Do not add new top-level `db:*`, `prisma:*`, `dev:ml-api`, `dev:ml-worker`, or `dev:demo` scripts.

## Why this exists

The repo has three daily local runtime owners: frontend, backend, and ML. PostgreSQL is not a fourth product runtime for daily developers; it is a backend dependency. Keeping DB and Prisma under backend prevents frontend and ML workflows from carrying backend setup details, while still preserving explicit backend maintenance commands.

## Rejected alternatives

- Resetting DB inside Nest startup hooks: rejected because app lifecycle should connect to DB, not destroy/recreate it.
- Top-level `db:*` and `prisma:*`: rejected because they make backend persistence look repo-global.
- Keeping ML API/worker as top-level `dev:ml-api` and `dev:ml-worker`: rejected because it splits one runtime owner into peer-level commands. The worker remains available as `dev:ml:worker` because it needs camera/model config and should not auto-start behind `dev:ml`.

## Where enforced

- Root script contract: `package.json`.
- Backend reset guard: `scripts/dev/assert-local-db-env.mjs`.
- Tests: `scripts/dev/command-contract.test.mjs` and `scripts/dev/assert-local-db-env.test.mjs`.
- Canonical docs: `README.md`, `AGENTS.md`, `docs/architecture.md`, and this rule.
