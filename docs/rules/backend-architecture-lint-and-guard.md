# Backend architecture lint & guard

> Scope: `backend/**`. Records the mechanical enforcement for
> [ADR-064](../decisions/backend/ADR-064-backend-layering-lint-and-guard-enforcement.md)
> (the enforcement layer for [ADR-046](../decisions/backend/ADR-046-rest-api-and-layering-convention.md)
> layering). Single-source pattern per [ADR-008](../decisions/common/ADR-008-issue-driven-worktree-enforcement.md);
> warn-tier boundary per [ADR-016](../decisions/common/ADR-016-enforcement-timing-principle.md).
> See also [backend-layering.md](./backend-layering.md), [dto-convention.md](./dto-convention.md),
> [rest-api-convention.md](./rest-api-convention.md), [code-stability.md](./code-stability.md).

## What is enforced where

| Boundary | Tool | Where it runs | Severity |
|---|---|---|---|
| controller ↛ repository / `prisma.service` / `@prisma/client` / adapter | ESLint `no-restricted-imports` | editor + CI `lint` | `warn` |
| repository ↛ HTTP exceptions / service / controller / adapter (PrismaService allowed) | ESLint `no-restricted-imports` | editor + CI `lint` | `warn` |
| service ↛ concrete adapter (Port/token only) | ESLint `no-restricted-imports` | editor + CI `lint` | `warn` |
| inline `*Dto` declared in controller/service (must live in `dto/*.dto.ts`) | ESLint `no-restricted-syntax` | editor + CI `lint` | `warn` |
| new typed rules: `consistent-type-imports`, `no-unnecessary-condition` | ESLint | editor + CI `lint` | `warn` |
| stability deny-list + `no-explicit-any` / `no-misused-promises` / `require-await` | ESLint (`recommendedTypeChecked` + deny-list) | editor + CI `lint` | `error` (unchanged) |
| **`schema.prisma` changed without a migration** | `scripts/backend-guard/check-schema-migration.sh` | `.githooks/pre-commit` + CI | **block** |

## Rules

- **warn-first, no per-file ignores.** New architecture/DTO/typed rules are `warn` and apply to every file; existing violations stay visible as warnings (no `ignores`, no immediate refactor). Escalation to `error` is a later, separate decision.
- **never downgrade an existing error.** Verify effective severity with `pnpm --filter backend exec eslint --print-config <file>` before changing any rule. Rules already `error` (incl. `no-explicit-any`, `no-misused-promises`, `require-await`) stay `error`.
- **DTOs live in `<domain>/dto/*.dto.ts`.** Do not declare exported `*Dto` interfaces/types inside controllers or services. Module folder layout (flat vs nested) is not normalized; only DTO location + inline-DTO warnings are enforced.
- **single source.** All backend guard logic lives in `scripts/backend-guard/`. `.githooks/pre-commit` and CI only invoke it — never reimplement. (The schema guard is intentionally not wired into agent `PreToolUse` hooks; git-native `pre-commit` already covers every vendor at commit.)
- **ADR-016 boundary.** Reversible layering/DTO/typed warnings appear only via editor ESLint + CI `lint`. They are never added as `pre-commit` or agent `PreToolUse` warn-tier hooks. Only the schema↔migration contract is hook-blocked.
- **tenant isolation is structural, not lint-checked.** Postgres RLS + the `PrismaService` runtime guard (`withFacilityContext`/`$allOperations`) are the source of truth. No static tenant checker exists by design.

## Commands

```sh
# Non-mutating lint (no --fix). Warn-first: new rules are warnings; the CI step is
# non-blocking (continue-on-error) during rollout because ~20 pre-existing type-safety
# errors predate CI linting (ADR-064 follow-up burns them down before blocking). Dev lint keeps --fix.
pnpm --filter backend run lint

# Schema↔migration coupling
sh scripts/backend-guard/check-schema-migration.sh staged                       # pre-commit
sh scripts/backend-guard/check-schema-migration.sh base "origin/${GITHUB_BASE_REF:-main}"  # CI
sh scripts/backend-guard/check-schema-migration.sh auto                          # auto-detect
```

See [`scripts/backend-guard/README.md`](../../scripts/backend-guard/README.md) for the guard-script details.
