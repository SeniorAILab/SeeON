# ADR-064: Backend layering lint and guard enforcement

## Status

Accepted

## Date

2026-06-22

## Context

[ADR-046](./ADR-046-rest-api-and-layering-convention.md) defines the backend layering convention (controller = transport adapter, service = orchestration/policy/ports, repository = persistence, DTO = HTTP shape, adapter = external port). Until now that convention was documentation-only: nothing mechanically stopped a controller from importing a repository or Prisma, a repository from throwing HTTP exceptions, a service from importing a concrete adapter, or a DTO from being declared inline inside a controller/service. The backend CI job also ran no lint at all (only typecheck/build/test), and `backend/package.json`'s `lint` script used `--fix` (mutating), which is unsuitable as a verification gate.

We also use multiple coding agents (Codex, GJC, Claude Code). Enforcement must behave identically across all of them and across humans, without copy-pasted logic that drifts.

Two accepted decisions constrain how this enforcement may be added:

- [ADR-008](../common/ADR-008-issue-driven-worktree-enforcement.md): all enforcement logic lives once under `scripts/` and every layer (git-native `.githooks/`, agent hooks, CI) only *invokes* it; git-native `pre-commit`/`pre-push` is the vendor-agnostic primary gate.
- [ADR-016](../common/ADR-016-enforcement-timing-principle.md): irreversible actions are hook-blocked; **reversible convention violations are NOT given warn-tier git/agent hooks** ("warn spam desensitizes and invites `--no-verify`"); test/lint CI is explicitly allowed and unrelated to that prohibition.

Tenant (facility) isolation for `Resident`/`Camera`/`Alert`/`Guardian`/`Floor`/`Space`/`Zone` is already enforced structurally by Postgres RLS (`ENABLE + FORCE`, app role `NOBYPASSRLS`, `app.facility_id` GUC set by `withFacilityContext`) plus the `PrismaService.$allOperations` fail-closed runtime guard ([ADR-031](./ADR-031-prisma-domain-model.md)/[ADR-032](./ADR-032-b2b-facility-multitenancy-rls.md), [ADR-058](./ADR-058-facility-placement-domain-model.md)). It does not need a static lint.

## Decision

Mechanically enforce the ADR-046 layering and DTO boundaries with two complementary mechanisms, both warn-first and dependency-free:

1. **Built-in ESLint rules (warn) in `backend/eslint.config.mjs`** for everything ESLint can express:
   - `@typescript-eslint/no-restricted-imports` file-scoped overrides for controller / repository / service import boundaries, encoding NodeNext `.js` suffixes (basename + globstar). The repository override excludes `prisma.service.js` via gitignore-style negation so legitimate `PrismaService` use is not flagged.
   - `no-restricted-syntax` (warn) forbidding exported `*Dto` interface/type declarations inside controller/service files, ignoring `dto/**/*.dto.ts`.
   - New, currently-off typed rules at `warn`: `consistent-type-imports`, `no-unnecessary-condition`.
   - The existing stability deny-list stays `error`, and rules already at `error` via `recommendedTypeChecked` (`no-explicit-any`, `no-misused-promises`, `require-await`) are **never** downgraded.
   - A non-mutating `lint:check` script (no `--fix`) is added; the existing `--fix` `lint` stays for developer cleanup.

2. **A single-source guard script `scripts/backend-guard/check-schema-migration.sh`** for the one boundary ESLint cannot express: if `backend/prisma/schema.prisma` changes without a companion `backend/prisma/migrations/*/migration.sql`, fail. This is a deployment contract (a stale-schema-without-migration breaks `prisma migrate deploy`), so it is hook-blocked at `pre-commit` and checked in CI.

**Enforcement wiring (ADR-008 single source, ADR-016 boundary):**

- `scripts/backend-guard/` is the SSOT; `.githooks/pre-commit` and CI only invoke it (no reimplementation).
- Reversible layering/DTO/typed warnings are surfaced only by editor ESLint + the CI `lint:check` step. They are **not** added to `pre-commit` or agent `PreToolUse` warn-tiers (ADR-016). The CI `lint:check` step is **non-blocking** (`continue-on-error`) during the warn-first rollout: at adoption the backend has ~20 pre-existing `recommendedTypeChecked` errors (`no-unsafe-*`, `unbound-method`, `no-base-to-string`, `no-unused-vars`) that were never CI-linted; the step still runs and prints them but does not break CI. Escalation to a blocking gate is a follow-up after that backlog is burned down.
- Only the schema↔migration contract is wired into `pre-commit` (staged mode) and CI (auto/base mode). It is deliberately **not** added to agent `PreToolUse`/`pre_tool_use` hooks (`.claude`/`.codex`): blocking every shell/edit action while a schema-only change is staged would create deadlock-prone friction, and the git-native `pre-commit` already covers every vendor (Claude/Codex/GJC/human) at commit time.
- The vendor-agnostic guarantee is git-native `pre-commit` (fires for every vendor at commit) + CI. Editor ESLint provides the per-vendor early feedback for layering/DTO; no vendor-specific pre-edit hook is needed for this work.

**Tenant isolation is intentionally not lint-checked**; RLS + the PrismaService runtime guard are the structural source of truth.

## Alternatives Considered

### Static tenant-access lint checker

- Pros: could warn early when code accesses a tenant model outside `withFacilityContext`.
- Cons: redundant with RLS + the runtime guard (which already fail closed), false-positive-prone, and low value.
- Rejected: structural guarantees already cover it; a static checker is duplicate enforcement. API-level structural enforcement (making `db.*` uncallable without a `facilityId`) is a separate refactor deferred to a follow-up.

### `eslint-plugin-boundaries` / resolver-based import rules

- Pros: richer dependency-graph expression.
- Cons: adds dependencies and resolver configuration.
- Rejected: violates the 신규 의존성 0 constraint; built-in `no-restricted-imports` is sufficient for the MVP.

### Fold the schema check into `scripts/git-guard/check-migrations.sh`

- Pros: CI already calls `check-migrations.sh`.
- Cons: mixes migration ordering with schema coupling and splits backend-specific logic away from the backend-guard SSOT.
- Rejected: backend enforcement lives under `scripts/backend-guard/`; `check-migrations.sh` keeps owning ordering only.

### Warn-tier git/agent hooks for layering/DTO

- Pros: earliest possible feedback.
- Cons: directly violates ADR-016 (warn spam, `--no-verify` training).
- Rejected: ESLint editor + CI `lint:check` already give continuous warn visibility without hook warn-tiers.

### Downgrade existing error-level typed rules to warn

- Pros: uniform "everything warn-first".
- Cons: weakens enforcement already in force.
- Rejected: only genuinely-new/currently-off rules become warn; existing errors stay errors.

## Consequences

- New code surfaces layering/DTO/typed warnings continuously in the editor and CI; existing violations (e.g. inline DTOs in `residents`/`cameras`/`guardians` services) remain visible warnings — tracked, not hidden, with no per-file ignores.
- Schema-without-migration is blocked at commit and in CI.
- `lint:check` is a non-mutating script (no `--fix`); `lint` (`--fix`) stays for developers. Backend lint enters CI as a non-blocking step now (warn-first; ADR-016-allowed test/lint CI) because of the ~20 pre-existing error backlog, and is escalated to blocking later.
- `scripts/backend-guard/` is a new minimal sibling to `scripts/git-guard/`; `setup-hooks.sh` chmods it.
- Mechanical layering review is codified, so `docs/rules/` can stay concise.

## Follow-ups

- Escalate selected warns to errors (ratchet or blanket) once the existing-violation backlog is burned down.
- Refactor existing inline DTOs and `CamerasService` direct-Prisma usage out of the warn set.
- Consider API-level structural tenant enforcement (a tenant-bound repository/wrapper requiring `facilityId`) as a separate decision.
- Reconsider a global `ValidationPipe` + `class-validator`/`class-transformer` (deferred from this work).
- Confirm the exact GJC pre-edit hook execution path for best-effort early feedback.
