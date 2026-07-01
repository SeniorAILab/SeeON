---
slug: staff-role-naming-alignment
status: done
date: 2026-07-01
owner: codex
---

# Staff Role Naming Alignment Plan

ULW session: `.omo/ulw-loop/caregiver-role-naming-alignment/`.

## Decisions

- Treat this as a HEAVY change because it touches auth/RBAC naming and the
  Prisma role enum.
- Use `STAFF` as the sole current frontend/backend non-admin care-team role
  name.
- Do not keep a current-code compatibility alias for `CAREGIVER`.
- Historical migration files can remain as immutable history, but current
  schema/source/tests/docs must not use `CAREGIVER` as the role name.
- Preserve behavior while renaming: staff users keep personal login and monitor
  view only; admin and super-admin remain unchanged.
- Keep frontend role names aligned with backend role names. Do not split backend
  `ADMIN` into a frontend-only `FACILITY_ADMIN` alias; admin is `ADMIN`, and
  super admin is `SUPER_ADMIN`.
- Keep only three current roles: `SUPER_ADMIN`, `ADMIN`, and `STAFF`. `VIEWER`
  is not a current frontend/backend role.
- Use product labels `SUPER_ADMIN` = 시스템 관리자, `ADMIN` = 원장님, and
  `STAFF` = 요양보호사. The Ataraxia PRD is the product role terminology SSOT;
  `front/src/lib/labels.ts` is only UI copy.

## Work Plan

1. Capture failing-first evidence.
   - Run an active-surface scan for `CAREGIVER`/`caregiver`.
   - Add/update targeted backend and frontend tests so `STAFF` is the expected
     non-admin staff role and `CAREGIVER` is not a current accepted role.
   - Run those tests before production edits and record RED output under
     `.omo/evidence/caregiver-role-naming-alignment/`.

2. Rename backend active role contract.
   - Update `backend/src/auth/auth.constants.ts`.
   - Update backend auth/session/RBAC tests and any active DTO/type references.
   - Update seeds/bootstrap scripts that type or create users with the role.

3. Rename Prisma enum value.
   - Update `backend/prisma/schema.prisma`.
   - Add a committed migration SQL that renames/converts existing enum data from
     `CAREGIVER` to `STAFF`.
   - Run `pnpm prisma:generate`.

4. Rename frontend role contract.
   - Update `front/src/types/index.ts`.
   - Update `front/src/services/api/authEndpoints.ts` and tests so API role
     parsing accepts the shared `SUPER_ADMIN | ADMIN | STAFF` role contract;
     legacy `CAREGIVER` must not remain in the active role parser.
   - Remove the frontend-only `FACILITY_ADMIN` role alias so backend `ADMIN`
     remains frontend `ADMIN`.

5. Update active docs and rules.
   - Update active docs under `docs/api`, `docs/domain`, `docs/rules`,
     `docs/onboarding`, and frontend/backend AGENTS where they describe current
     role names.
   - Do not rewrite archived work-plan history unless it is referenced as
     current guidance.

6. Verify and record evidence.
   - `pnpm --filter backend test -- auth`
   - `pnpm --filter front test -- authEndpoints authService`
   - `pnpm prisma:generate`
   - `pnpm typecheck`
   - Final active-surface `rg` scan.
   - Record ULW evidence with cleanup receipts.

## Agent-Executable QA

- Active naming scan:
  `rg -n '\bCAREGIVER\b|caregiver' backend/src backend/test backend/prisma/schema.prisma backend/prisma/seed*.ts front/src front/AGENTS.md front/src/AGENTS.md docs/api docs/domain docs/rules docs/onboarding .env.local.example`
- Backend targeted tests:
  `pnpm --filter backend test -- auth`
- Frontend targeted tests:
  `pnpm --filter front test -- authEndpoints authService`
- Generation/typecheck:
  `pnpm prisma:generate`
  `pnpm typecheck`

## Guardrails

- Do not edit `.codex/config.toml`.
- Do not use test skipping, weakened assertions, `as any`, `@ts-ignore`, or
  compatibility aliases to get green checks.
- Do not run destructive database reset commands.
