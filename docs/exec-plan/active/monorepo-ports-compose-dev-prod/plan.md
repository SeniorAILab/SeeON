---
slug: monorepo-ports-compose-dev-prod
date: 2026-06-16
author: ralplan (2026-06-16-ports-compose)
status: active
spec: ./spec.md
related-adrs: [ADR-041]
---

# Plan — 모노레포 포트 표준화 + Compose dev/prod 전략

> Source: `.gjc/plans/ralplan/2026-06-16-ports-compose/stage-07-final.md`.
> Consensus status: Architect CLEAR / APPROVE, Critic OKAY / APPROVE. This file is the git-canonical exec-plan summary for slug `monorepo-ports-compose-dev-prod`.

## Decision Summary

- Port map: `front:3000`, `backend:8080`, `ml-serving:8000`, `db:5432`.
- Daily development: native hot reload with `pnpm db:up` plus `pnpm dev:front`, `pnpm dev:backend`, and `pnpm dev:ml`.
- Compose topology: `compose.yaml` base + `compose.override.yaml` dev overlay with app `profiles: [full]` + `compose.prod.yaml` explicit production overlay.
- Default Compose path remains db-only; full container parity is opt-in with `--profile full`.
- App Dockerfiles are multi-stage (`base -> deps -> dev -> build -> runner`) and use root build context where workspace lockfiles are required.
- Runtime URL contract: browser-facing values use `localhost`; container/server-internal values use Compose service names.
- Port/URL SSOT is the root `.env` / `.env.example`.

## PR Slices

### PR1 — Native port/env foundation

Files:

- `backend/.env.example`
- `backend/.env.development`
- `backend/src/main.ts`
- root `.env.example`
- `front/package.json` only if a non-3000 dev port is present

Scope:

- Set backend port to `8080` and CORS/front origin to `http://localhost:3000`.
- Keep backend-to-db native URLs on `localhost:5432`.
- Set native backend-to-ML URL to `http://localhost:8000`.
- Add root SSOT variables for `FRONT_PORT`, `BACKEND_PORT`, `ML_SERVING_PORT`, `POSTGRES_PORT`, and browser API URL.
- Preserve existing root env variables; append rather than replace.

Focused verification owned by integration:

- `pnpm db:up`
- `pnpm dev:backend` + `curl :8080`
- `pnpm dev:ml` + `curl :8000/health`
- `pnpm dev:front` + `curl -I :3000`

### PR2a — Compose base/override and scripts

Files:

- `docker-compose.yml` / `compose.yaml`
- `compose.override.yaml`
- root `package.json`

Scope:

- Preserve the existing db service settings while moving to the new Compose base name.
- Add app service topology with root context, service-name networking, and env interpolation.
- Put app dev behavior behind `profiles: [full]` in `compose.override.yaml`; db remains unprofiled.
- Add scripts for db-only/default Compose, full dev parity, and prod up while keeping `db:up` / `db:down` behavior.

Focused verification owned by integration:

- `docker compose config --services` shows db-only default activation.
- `docker compose --profile full config --services` shows `db`, `backend`, `ml-serving`, and `front`.

### PR2b — App Dockerfiles and prod overlay

Files:

- `backend/Dockerfile`
- `front/Dockerfile`
- `front/next.config.ts`
- `ml/Dockerfile`
- `compose.prod.yaml`

Scope:

- Backend Dockerfile: root context, pnpm lockfile-first install, build-time Prisma generate, `dist` runner, generated Prisma client/native engine copied, no startup migration/seed.
- Front Dockerfile: root context, pnpm lockfile-first install, Next standalone output, runner command `node server.js` on port `3000`.
- ML Dockerfile: uv lockfile-first sync, dev stage may use reload, runner uses `uv sync --frozen --no-default-groups` and `uvicorn serving.main:app --host 0.0.0.0 --port 8000` without reload.
- Prod overlay: runner targets, no dev bind mounts, no reload commands, restart policy where appropriate.

Focused verification owned by integration:

- `docker compose --profile full up -d --build` smoke.
- `docker compose -f compose.yaml -f compose.prod.yaml config` includes 4 services and excludes dev mount/reload behavior.

### PR3 — ADR and docs

Files:

- `docs/decisions/common/ADR-041-port-standardization-compose-strategy.md`
- `docs/decisions/README.md`
- `README.md`
- `docs/exec-plan/active/monorepo-ports-compose-dev-prod/spec.md`
- `docs/exec-plan/active/monorepo-ports-compose-dev-prod/plan.md`

Scope:

- Record the accepted port/Compose strategy as a common ADR.
- Update the ADR index.
- Update root README with port map, native quick start, Compose parity/prod commands, browser-vs-service-name URL boundary, and macOS bind-mount watcher caveat.
- Mirror the approved deep-interview spec and final ralplan plan into git-canonical exec-plan files.

## Key Risks and Mitigations

- **Accidental full-stack default Compose**: app services are profile-gated in the dev override; default path remains db-only.
- **Browser URL misuse**: README and env examples distinguish browser `localhost` from service-name internal URLs.
- **macOS watcher lag**: native dev is documented as the default daily path; container dev is parity-oriented.
- **Workspace build drift**: Dockerfiles use root context and lockfile-first dependency installation.
- **Prisma runtime surprises**: generation happens at image build time; generated artifacts are copied into the runner.
