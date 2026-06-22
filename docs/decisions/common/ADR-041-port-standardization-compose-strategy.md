# ADR-041: Port Standardization and Compose Dev/Prod Strategy

## Status

ACCEPTED. Host Compose topology partially superseded by [ADR-062](./ADR-062-host-edge-compose-topology.md) (`ml-serving` → external edge; host stack = db+backend+front[nginx]) and by [ADR-063](./ADR-063-native-only-dev-no-compose-override.md) (the `compose.override.yaml` container-dev overlay is removed — dev is native-only; compose is `compose.yaml` + `compose.prod.yaml` + `compose.edge.yaml`). The port map and native-daily-development principle from this ADR remain in force.

## Date

2026-06-16

## Context

The monorepo runs four runtime services: Next.js product frontend, NestJS backend, FastAPI ML serving, and PostgreSQL. Before this decision, frontend and backend development both gravitated toward port 3000, creating local confusion even when the frontend itself was healthy. The repository also had a PostgreSQL-only Compose file, while the implementation plan needs both fast native development and a single-server Compose deployment path.

This is a strict common decision because it constrains `front/`, `backend/`, `ml/`, root orchestration scripts, Compose topology, and environment-variable contracts together.

## Decision

Adopt one repo-wide port and Compose strategy:

| Service | Host port | Container port |
|---|---:|---:|
| `front` | `3000` | `3000` |
| `backend` | `8080` | `8080` |
| `ml-serving` | `8000` | `8000` |
| `db` | `5432` | `5432` |

- Daily development is native hot reload: `pnpm db:up` plus `pnpm dev:backend`, `pnpm dev:ml`, and `pnpm dev:front`. App containers are not the default inner loop.
- Compose uses three files:
  - `compose.yaml`: base topology for `db`, `backend`, `ml-serving`, and `front`.
  - `compose.override.yaml`: development overlay automatically merged by Compose; app services are gated with `profiles: [full]`, while `db` has no profile.
  - `compose.prod.yaml`: production overlay used explicitly with `-f compose.yaml -f compose.prod.yaml`; it does not depend on the override profile gate.
- The default `docker compose up` / `pnpm db:up` path remains db-only. Full container parity requires `docker compose --profile full up` or the package script wrapping it.
- App images use multi-stage Dockerfiles with repository-root build context and lockfile-first dependency layers.
- pnpm services build from the root workspace lockfiles and install with service filters.
- ML runner images use `uv sync --frozen --no-default-groups`; `--no-dev` is rejected because dependency groups in this project include non-serving groups that must be excluded explicitly.
- Backend images run Prisma client generation at build time and copy the generated client/native engine artifacts into the runner image. Startup-time generate/migrate/seed is not part of the runtime contract.
- Port values, plus the browser-facing `NEXT_PUBLIC_API_URL`, are single-sourced from the root `.env` / `.env.example` and interpolated into Compose. Container-internal service-name URLs (`http://ml-serving:8000`, `db:5432`, `http://backend:8080`) and the localhost `FRONT_ORIGIN` are set directly in Compose because they are only meaningful inside the Compose network or are derived from the fixed port map.
- Browser-visible URLs use `localhost` because browsers run on the host. Container/server-internal URLs use Compose service names: `backend` reaches ML at `http://ml-serving:8000`, backend reaches Postgres at `db:5432`, and server-side frontend calls may use `http://backend:8080` only when such call sites exist.

## Decision Drivers

- Remove frontend/backend port collisions and restore the product frontend to the expected `localhost:3000`.
- Preserve fast daily development on macOS/Apple Silicon, where bind-mounted watcher behavior can lag behind native hot reload.
- Provide a deployment-shaped Compose topology without forcing containers into every development loop.
- Keep build reproducibility aligned with the existing polyglot monorepo: root pnpm workspace lockfile for TypeScript packages and `ml/uv.lock` for Python.
- Prevent runtime startup from masking build defects such as missing Prisma generation.

## Alternatives Considered

### Keep Compose permanently db-only

Rejected. It preserves the current local DB workflow but leaves dev/prod topology split across undocumented commands and does not provide a parity path for the app services.

### Make full Compose the default development mode

Rejected. It conflicts with the chosen native hot-reload daily loop, worsens macOS watcher risk, and makes the common case slower to serve the less common parity check.

### Use service-local Docker build contexts

Rejected. `front/` and `backend/` depend on the root pnpm workspace metadata and lockfile. Service-local contexts hide the files needed for reproducible workspace installs.

### Generate Prisma client or run migrations at container startup

Rejected. Runtime generation masks image build defects and makes startup side effects harder to reason about. Migrations/seeding remain explicit operational actions, not image entrypoint behavior.

### Use service-name URLs everywhere

Rejected. `NEXT_PUBLIC_*` values are embedded for browser execution; `http://backend:8080` is not resolvable from a user's browser. Service names are for server/container-internal calls only.

## Why Chosen

The profile-gated override is the smallest strategy that satisfies both constraints: default Compose remains safe and db-only for native development, while `--profile full` and the prod overlay exercise the same service topology for parity and deployment. Root-context, lockfile-first Dockerfiles keep builds reproducible across the pnpm workspace, and build-time Prisma generation makes missing generated artifacts fail before runtime.

## Consequences

**Positive:**

- The standard local map is simple: frontend 3000, backend 8080, ML serving 8000, database 5432.
- Native development remains the fastest default path.
- Compose can represent the deployable four-service topology without changing the db-only default.
- Browser/server URL boundaries are explicit before frontend call sites grow.
- Production images are slimmer and more predictable because ML dependency groups and Prisma artifacts are handled at build time.

**Negative / trade-offs:**

- The repository now carries three Compose files and three app Dockerfiles, increasing review surface.
- Developers must remember that app containers require `--profile full` in development.
- URL configuration has two valid namespaces (`localhost` for browsers, service names for container/server internals), so documentation and env examples must stay precise.
- Compose full-mode bind mounts are best-effort on macOS and are not the preferred hot-reload loop.

## Follow-ups

- When product frontend server-side backend calls are introduced, wire them to the internal `API_INTERNAL_URL=http://backend:8080` boundary rather than reusing browser-only `NEXT_PUBLIC_API_URL` server-side by accident.
- Future real production deployment must decide secrets, TLS, domains, host provisioning, and CI/CD separately.
- Keep README and `.env.example` synchronized with any future port or service-name change.
