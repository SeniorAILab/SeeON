# ADR-063 — Native-only dev: drop the container-dev `compose.override.yaml`

- Status: Accepted
- Date: 2026-06-21
- Supersedes (partial): ADR-041 — the `compose.override.yaml` container-dev overlay clause is removed. ADR-041's port map, native-daily-development principle, and root-context multi-stage Dockerfiles remain in force.
- Refines: ADR-062 (host/edge compose topology) — the host stack is now `compose.yaml` (full profile) + `compose.prod.yaml` overlay + `compose.edge.yaml`, with no dev overlay.

## Context

ADR-041 established a three-file compose pattern (`compose.yaml` base + `compose.override.yaml` dev overlay + `compose.prod.yaml` prod overlay), where the override auto-merged a container-dev variant (`target: dev`, bind-mounts, `--watch`) gated behind `profiles: [full]`.

In practice the override does not earn its keep:

- **Daily development is native** (`pnpm dev:*` + `pnpm db:up`), per ADR-041 itself. Native already provides hot reload.
- **The container-dev path is slower, not faster.** macOS (Apple Silicon) bind-mount file watching lag is the very reason native is the default; the override therefore offers a degraded path nobody should use.
- **It is a drift surface.** Its duplicated service config rotted unnoticed (it still ran `next dev` after the front migrated to Vite; fixed in ADR-062 / #299) precisely because nobody runs it.
- **Its only genuinely useful job — gating `docker compose up` to db-only — is one line of `profiles: [full]`** that belongs in `compose.yaml`. Its only script consumer was `compose:dev:full`.

Selective startup (`docker compose up -d db` for db-only, `--profile full` for the whole stack) covers every real need without a second auto-merged file.

## Decision

1. **Delete `compose.override.yaml`.**
2. **Move `profiles: [full]` onto `backend` and `front` in `compose.yaml`** (runner targets). Default `docker compose up` / `pnpm db:up` stays db-only; `docker compose --profile full up -d --build` brings up the whole host stack.
3. **Replace the ambiguous full-stack script with `compose:local:up`.** It builds the local runner full stack with `.env.local`. Do not keep `compose:dev:full`, `compose:full`, or other fallback aliases.
4. **Dev remains native-only.** There is no containerized hot-reload path; use `pnpm dev:front` / `dev:backend` / `dev:ml` with `pnpm db:up`.

Resulting compose files: `compose.yaml` (host stack, full profile) + `compose.prod.yaml` (prod overlay) + `compose.edge.yaml` (edge). No `compose.override.yaml`.

## Decision Drivers

- Remove an unused, drift-prone path; make the file set match how the team actually works.
- Keep `docker compose up` db-only for the native daily loop without a separate overlay file.
- Fewer moving parts → more intuitive compose surface.

## Alternatives Considered

- **Keep the override (status quo, ADR-041)** — rejected: it is the slow path native exists to avoid and a recurring drift source.
- **Fold prod into base too (single-file compose)** — rejected: `compose.prod.yaml` carries fail-closed secrets (`:?`) and `restart` that must not gate the default `docker compose up`; prod stays a separate overlay.

## Consequences

- No containerized hot-reload dev. Daily dev is native (already the policy).
- `pnpm compose:local:up` is the local full-stack command; `pnpm compose:prod:up` is the prod-shaped host-stack command. There is no `compose:full` fallback alias.
- ADR-041's override clause and ADR-062's "base/override/prod three-file" wording are superseded for the override portion.

## Follow-ups

- None required; prod overlay and edge file are unchanged.
