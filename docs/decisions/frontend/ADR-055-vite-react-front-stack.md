# ADR-055: Vite React Front Stack as `front/` SSOT

## Status

PROPOSED.

## Date

2026-06-20

## Context

`front/` was originally scaffolded as a Next.js/TypeScript browser client under [ADR-001](../common/ADR-001-polyglot-monorepo.md). During PR #257, Junho's Vite 5 + React 18 dashboard became the product frontend implementation that needed to be preserved as the single source of truth instead of maintaining a parallel Next.js starter.

Phase 1 of the migration replaced the Next.js starter with the Vite app in `front/`, initially kept the application mock-driven with `USE_MOCK=true`, unified TypeScript package management under pnpm via `pnpm import` and exact pins, and preserved the repository's standardized frontend port 3000 from [ADR-041](../common/ADR-041-port-standardization-compose-strategy.md). After the local backend/db development infrastructure landed, the default frontend runtime moved to real backend mode (`VITE_USE_MOCK` unset or `false`); explicit `VITE_USE_MOCK=true` remains for tests and demo-only surfaces while backend endpoint wiring is completed incrementally.

This migration was stacked as atomic commits on PR #257. That is a deliberate exception to the normal issue/worktree path in [ADR-008](../common/ADR-008-issue-driven-worktree-enforcement.md) and the PR size governance in [ADR-039](../common/ADR-039-pr-size-gate-threshold.md): the worktree starts from an existing PR branch, and the size gate is waived for this migration series because the change replaces a starter frontend with a pre-existing product app while keeping backend/ML behavior unchanged.

## Decision

Make Vite 5 + React 18 the canonical product frontend stack for `front/`.

- `front/` is the SSOT for Junho's dashboard app; the previous Next.js starter is no longer the active product frontend implementation.
- Vite dev and preview run on port 3000 to preserve the repo-wide port contract from ADR-041.
- The monorepo stays pnpm-based for TypeScript packages, with root workspace installation and exact package pins.
- Frontend development defaults to real backend mode. Mock mode is explicit via `VITE_USE_MOCK=true` and does not define the default dev path.
- [ADR-001](../common/ADR-001-polyglot-monorepo.md) remains authoritative for the polyglot monorepo and pnpm workspace shape, but its frontend stack statement is partially superseded: `front/` is now Vite + React rather than Next.js.

## Decision Drivers

- Preserve the working product dashboard rather than rebuilding it inside a starter Next.js shell.
- Remove parallel frontend sources of truth before backend integration work starts.
- Keep the daily development URL stable at `http://localhost:3000`.
- Avoid backend/ML churn during a frontend-stack migration.
- Keep dependency resolution reproducible through the existing pnpm workspace contract.
- Allow Phase 2 to focus on backend contract matching instead of framework migration.

## Alternatives Considered

### Keep Next.js side-by-side with the Vite app

Rejected. Two product frontend stacks would create competing sources of truth, duplicate routing/state/API client decisions, and make Phase 2 backend matching ambiguous.

### Restart from a fresh branch off `main` and split into separate PRs

Rejected. The migration target already existed as PR #257, and preserving review continuity for the replacement app is more valuable than manufacturing a fresh branch history. This is an explicit, bounded exception to ADR-008 and ADR-039 for this PR only.

### Delete lockfiles and perform a fresh pnpm install re-resolution

Rejected. Re-resolving the dependency graph would mix framework migration with unrelated package upgrades and make review/reproducibility worse. Phase 1 keeps dependency changes constrained to the migration need and exact pins.

### Keep the Vite app as an npm island

Rejected. An npm-managed `front/` would violate ADR-001's TypeScript workspace contract, split lockfile authority, and make root scripts/CI less predictable.

### Keep Vite's default port 5173

Rejected. ADR-041 standardizes the product frontend on port 3000. Moving the migrated app to 5173 would break the documented local URL and create unnecessary divergence from Compose/env conventions.

## Consequences

**Positive:**

- `front/` now has one canonical implementation: the Vite React product dashboard.
- The frontend development URL remains `localhost:3000`.
- The TypeScript workspace remains pnpm-based and root-installable.
- Backend integration can be planned against the actual frontend types and service expectations.
- The migration isolates framework replacement from backend, ML, and realtime changes.

**Negative / trade-offs:**

- ADR-001's original Next.js frontend-stack statement is partially superseded and must be read through this ADR for `front/`.
- Any Next.js-specific assumptions in old docs or tooling are no longer valid for the product frontend.
- Remaining mock-backed services must be treated as incremental wiring debt, not as the default development environment.
- The PR #257 migration intentionally accepts an unusual stacked-commit/size-gate exception; future work must not generalize that exception without a new decision.

## Follow-ups

Phase 2 must implement the deferred backend-matching contract documented in [`docs/exec-plan/active/frontend-vite-ssot-migration/phase2-backend-contract.md`](../../exec-plan/active/frontend-vite-ssot-migration/phase2-backend-contract.md). Every item below is deferred and not implemented by Phase 1:

- Implement real email/password JWT login and authenticated session handling for the frontend auth service.
- Match frontend service comments to backend endpoints for dashboard, events, residents, zones, admin, AI ingest, Kakao, and video.
- Reuse the product Kakao registration and send fan-out model from ADR-042, ADR-044, ADR-052, and ADR-053.
- Treat frontend `types/index.ts` as the Phase 2 domain contract input, refining ADR-031 and ADR-037 as needed.
- Refine the hybrid auth boundary from ADR-033 for email/password JWT plus Kakao registration/send behavior.
- Map ML `/ingest` events into backend `DetectionEvent`, `SpaceStatus`, and delivery side effects.
- Keep realtime SSE plus ticket behavior from ADR-034 deferred until the backend contract is ready.
