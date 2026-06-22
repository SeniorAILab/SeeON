---
slug: backend-architecture-lint-guard-ssot
status: active
date: 2026-06-22
author: gjc
issue: 305
kind: plan
source: ralplan consensus run 2026-06-21-2312-bgssot (final v2)
---

# RALPLAN Final Plan v2 — Backend Architecture Lint & Guard SSOT (pending approval)

> Status: **pending approval** (no execution). Supersedes stage-03-final. **Change v2 (user-directed):** the static tenant-access checker (`tenant-access-check.mjs`) is **DROPPED** — cross-tenant access is already structurally guaranteed by Postgres RLS (`ENABLE+FORCE`, app role `NOBYPASSRLS`, `SET LOCAL app.facility_id`) + the `PrismaService.$allOperations` fail-closed runtime guard. A static lint would be a redundant, false-positive-prone third layer, not the guarantee. Source spec + revision history under `.gjc/_session-…/plans/ralplan/2026-06-21-2312-bgssot/`.

One-line goal: warn-first backend(NestJS) layering/DTO/typed-lint via built-in ESLint (신규 의존성 0) + the ONE genuinely ESLint-impossible contract check (schema↔migration coupling) under single-source `scripts/backend-guard/`, invoked identically by all vendors (Codex/GJC/Claude) + .githooks + CI — respecting ADR-008 (single source) and ADR-016 (no warn-tier hooks for reversible conventions), zero product behavior change. Tenant isolation is left to the existing structural guarantee (RLS + runtime guard).

## RALPLAN-DR Consensus Record
- Iterations: 2 consensus passes (stage-01 BLOCK/ITERATE → stage-02 **CLEAR/APPROVE + OKAY**), then **v2 user-directed scope reduction** (drop static tenant checker). The removal lowers risk (eliminates tenant AST false-positive + parse-failure risks) and was already endorsed as low-value by all three reviewers; no new architectural concern is introduced, so no additional consensus loop was required.
- Artifacts: stage-01-{planner,architect,critic}, stage-02-{revision,architect,critic}, stage-03-final, stage-04-revision (this de-scope), stage-05-final (this file).

### Principles
1. 신규 의존성 0: existing ESLint, typescript-eslint, TypeScript, POSIX sh, git only (no Node AST checker now needed).
2. Preserve current enforcement: never downgrade an existing effective ESLint error to warn; warn-first only for genuinely-new/currently-off rules.
3. SSOT by invocation: `scripts/backend-guard/` owns backend guard logic; vendors/.githooks/CI only call entrypoints.
4. ADR-016 boundary: reversible backend conventions visible via editor ESLint + CI `lint:check`, never git/agent warn-tier hooks.
5. **Tenant isolation is structural, not lint-checked**: Postgres RLS (FORCE + NOBYPASSRLS, `app.facility_id` GUC via `withFacilityContext`) + `PrismaService.$allOperations` (`MissingTenantContextError`, fail-closed) are the authoritative guarantee. No static tenant checker is added.

### Decision Drivers
1. Respect ADR-008 + ADR-016 simultaneously.
2. Catch schema↔migration coupling locally + in CI (ESLint-impossible deployment contract).
3. Useful initial rule set without churn; no weakening of existing lint errors; no redundant guards over already-structural guarantees.

### Option Forks (resolved)
- ~~A. Tenant checker~~ — **REMOVED in v2** (structural RLS + runtime guard already guarantee isolation).
- **B. schema↔migration host** → `scripts/backend-guard/check-schema-migration.sh` (B1). (B2 fold-into-git-guard invalidated.)
- **C. ESLint engine** → built-in `no-restricted-imports` + `no-restricted-syntax`, flat-config overrides (C1). (C2 plugin/resolver invalidated: new deps.)
- **D. Vendor coverage** → git-native pre-commit + CI as guarantee; vendor pre-tool hooks best-effort (D1). (D2 duplicated logic invalidated.)

## Implementation Plan (condensed; full file-by-file detail in stage-02-revision.md, minus the now-dropped tenant checker)

### Component 1 — ESLint rules (`backend/eslint.config.mjs`, `backend/package.json`)
- Keep stability deny-list at `error` (no-floating-promises, only-throw-error, prefer-promise-reject-errors, switch-exhaustiveness-check, no-non-null-assertion, prettier).
- **Verify effective severity first** (`pnpm --filter backend exec eslint --print-config src/main.ts`). Leave any rule already `error` (incl. `no-explicit-any`, `no-misused-promises`, `require-await` if currently error) at `error`. **Never downgrade an existing error to warn.**
- Add `warn` only for genuinely-new/currently-off typed rules: `consistent-type-imports`, `no-unnecessary-condition`, `require-await` (only if currently off).
- File-scoped `no-restricted-imports` (warn), NodeNext `.js` basename + globstar patterns:
  - `*.controller.ts` / `controllers/**`: forbid `**/*.repository.js`, `**/repositories/**/*.js`, `**/prisma.service.js`, `@prisma/client`, `**/adapters/**/*.js`.
  - `*.repository.ts` / `repositories/**`: forbid `@nestjs/common` HTTP-exception importNames + `**/*.service.js`, `**/*.controller.js`, `**/adapters/**/*.js`.
  - `*.service.ts` / `services/**`: forbid `**/adapters/**/*.js`; allow `**/ports/**/*.js`.
- Inline DTO `no-restricted-syntax` (warn) on controller/service files, ignore `**/dto/**/*.dto.ts`: `ExportNamedDeclaration > TSInterfaceDeclaration[id.name=/Dto$/]` and `…TSTypeAliasDeclaration[id.name=/Dto$/]`.
- No per-file ignores for existing residents/cameras/guardians inline DTOs.
- `package.json`: add `lint:check` = `eslint "{src,apps,libs,test}/**/*.ts"` (no `--fix`); keep dev `lint` (`--fix`).
- Korean comments on new overrides.

### Component 2 — Guard script (`scripts/backend-guard/`)  *(now a single script)*
- `check-schema-migration.sh` (POSIX sh, Korean, sources `scripts/git-guard/lib.sh`): modes `staged` (pre-commit), `base <ref>` (CI), `auto`. Trigger: if `backend/prisma/schema.prisma` changed in the diff set, require a changed `backend/prisma/migrations/*/migration.sql`; else fail (nonzero + Korean message). Schema unchanged → 0; migration-only → 0. Does NOT replace `check-migrations.sh`.
- `README.md` (Korean): entrypoint, modes, examples, ADR-008/016 boundary; **note that tenant isolation is NOT lint-checked here — it is guaranteed by RLS + `PrismaService` runtime guard (SoT).**
- **Removed in v2:** `tenant-access-check.mjs` and the `lint-check.sh` wrapper (no longer needed — CI calls `pnpm --filter backend lint:check` directly).

### Component 3 — Enforcement wiring
- `.githooks/pre-commit`: add `sh "$root/scripts/backend-guard/check-schema-migration.sh" staged` (keep existing guards). No lint/architecture/DTO warns in pre-commit.
- `scripts/git-guard/setup-hooks.sh`: chmod `check-schema-migration.sh`; update confirmation output.
- `.github/workflows/ci.yml` backend job: guarantee base ref (`fetch-depth: 0` or explicit `git fetch origin "${GITHUB_BASE_REF:-main}"`); add schema-coupling step (`base "origin/${GITHUB_BASE_REF:-main}"`); add backend lint step `pnpm --filter backend lint:check` after Install/Prisma generate, before Typecheck; **no `--fix`, no `--max-warnings`**; keep typecheck/build/test; CI green on warn-only.
- `.claude/settings.json` + `.codex/config.toml`: thin best-effort calls to `check-schema-migration.sh` only.
- GJC coverage: no duplicated hook; document that the vendor-agnostic guarantee is git-native pre-commit + CI; **exact GJC pre-edit hook execution path is unverified, confirm at execution.**

### Component 4 — DTO & deliverables
- New backend ADR (re-run discovery; ADR-060/061 exist → use **ADR-064** if free): `docs/decisions/backend/ADR-064-backend-layering-lint-and-guard-enforcement.md` — enforcement layer for ADR-046, reaffirms ADR-008, defines ADR-016 boundary, **and records that tenant isolation is deliberately left to RLS + runtime guard (no static tenant lint)**. Update the stale `docs/decisions/README.md` backend index (ADR-060/061 + new ADR).
- `docs/rules/backend-architecture-lint-and-guard.md`: command surfaces + cross-refs to existing `backend-layering.md`, `dto-convention.md`, `rest-api-convention.md`, `code-stability.md`, ADR-046/008/016; existing inline DTOs stay warnings.
- `AGENTS.md`: one Conventions routing line → new rule + `scripts/backend-guard/`.
- Do NOT normalize flat↔nested layouts.

## Acceptance Criteria
AC1 controller-boundary warns (flat + nested `.js`). AC2 repository-boundary warns. AC3 service→adapter warns (port allowed). AC4 inline-DTO warns in residents/cameras/guardians; `dto/` allowed. AC5 schema-only change fails coupling (staged + CI base); schema+migration passes. AC7 `lint:check` (no `--fix`) added; dev `lint` retained. AC8 CI base-fetch + schema-coupling + `lint:check` steps present; typecheck/build/test retained; green on warn-only. AC9 new rules warn-only AND existing errors still error (verified via `--print-config` + a `no-floating-promises` sample). AC10 all vendor/git/CI layers invoke `scripts/backend-guard/`; setup-hooks chmod; no unverified GJC claim. AC11 ADR + docs/rules + README index update + scripts README + AGENTS routing, correct cross-refs. AC12 Korean comments. **AC6 (static tenant checker) — REMOVED in v2.** (Full fixture recipes for AC1/2/3/5/9 in stage-02-revision.md, excluding the dropped tenant fixtures.)

## Risks (mitigations in stage-02-revision.md, minus dropped tenant risks)
NodeNext `.js` pattern misses; accidental ESLint downgrade; warn noise; CI diff-base ambiguity; CI warn accidentally blocking; vendor hook overreach (ADR-016); GJC early-feedback overclaim; ADR number/index drift. *(Removed: tenant AST false positives, tenant SSOT parse failure.)*

## Verification
`eslint --print-config` (no downgrade) → `pnpm --filter backend lint:check` → AC1–AC3 import fixtures → AC5 staged + CI base coupling → AC9 error-sample → inspect `ci.yml` → confirm SSOT wiring → confirm doc deliverables. CI/backend build/test stay green.

---

## ADR (to distill at execution): Backend layering lint & guard enforcement (v2)
**Decision.** Mechanically enforce ADR-046 backend layering + DTO boundaries with built-in ESLint rules (warn-first, no new deps) for import/inline-DTO boundaries, and a single-source `scripts/backend-guard/check-schema-migration.sh` for the one ESLint-impossible check (schema↔migration coupling). All vendors + .githooks + CI invoke the same script. Reversible-convention warnings live only in editor ESLint + CI `lint:check`, never git/agent warn-tier hooks. **Tenant isolation is deliberately NOT lint-checked**: it is structurally guaranteed by Postgres RLS (FORCE + NOBYPASSRLS + `app.facility_id`) and the `PrismaService.$allOperations` fail-closed runtime guard.

**Drivers.** ADR-008 + ADR-016 must both hold; schema↔migration is an ESLint-impossible deployment contract; avoid redundant guards over already-structural guarantees; no churn / no weakening existing lint errors.

**Alternatives considered.** Static tenant-access lint checker (rejected v2: redundant with RLS + runtime guard, false-positive-prone, low value — confirmed by reviewers and user); API-level structural enforcement that makes `db.*` uncallable without `facilityId` (deferred: separate data-access refactor); `eslint-plugin-boundaries`/resolver (rejected: deps); fold schema check into git-guard (rejected: SSOT location); pre-commit warn-tier for architecture (rejected: ADR-016); duplicated per-vendor hook logic (rejected: drift); broad architecture scanner / module-export guard / layout normalization / global ValidationPipe (deferred).

**Why chosen.** Built-in ESLint = zero deps; `scripts/backend-guard/` = ADR-008 single-source; ESLint-as-lint (editor + CI) gives continuous warn visibility (user's "예외 없이 계속 경고" goal) without ADR-016-prohibited warn-tier hooks; tenant safety is already guaranteed by RLS + runtime guard, so a static checker is intentionally omitted.

**Consequences.** New code surfaces layering/DTO/typed warnings continuously; existing violations remain visible warnings (tracked, not hidden); schema↔migration coupling blocks at commit + CI; backend lint enters CI as non-blocking warn (ADR-016-allowed test/lint CI); a minimal `scripts/backend-guard/` (one script) sibling to `git-guard/`; tenant isolation continues to rely on RLS + runtime guard (no new tenant tooling); docs/rules + ADR + AGENTS routing make it discoverable across vendors.

**Follow-ups.** Escalate warn→error later; refactor existing inline DTOs + `CamerasService` Prisma-direct usage; optional **API-level structural tenant enforcement** (typed repository/wrapper requiring `facilityId` so `db.*` can't be misused) as a separate refactor/ADR; reconsider global ValidationPipe; verify exact GJC pre-edit hook path; optional module-export guard / layout normalization later.

## Out of scope / Deferrals
Static tenant-access checker (dropped — structural guarantee suffices); API-level structural tenant enforcement (separate refactor); global ValidationPipe + class-validator/transformer; module-export guard; flat↔nested layout normalization; immediate inline-DTO refactor; immediate warn→error escalation; broad architecture import scanner; route/global-prefix/API-rename changes.
