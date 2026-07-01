---
slug: staff-role-naming-alignment
status: done
date: 2026-07-01
owner: codex
---

# Staff Role Naming Alignment Spec

## Problem

The PRD target vocabulary is `super_admin`, `admin`, and `staff`.
The codebase still uses `CAREGIVER` as an active frontend/backend role name in
RBAC constants, Prisma schema/types, tests, and frontend backend-role mapping.
The user explicitly requested that `CAREGIVER` should not be used as a frontend
or backend name.

## Target

- `STAFF` is the current non-admin facility staff role name across active
  frontend and backend code.
- Backend RBAC keeps the existing behavior: staff users can log in and view the
  monitor surface, while admin and super-admin permissions are unchanged.
- Frontend public/domain role vocabulary remains `STAFF`.
- Historical migration files may remain historical records, but no active
  schema, seed, source, test, API/domain docs, or frontend/backend rules should
  keep `CAREGIVER` as the current name.

## Must Have

- Rename active backend role constants and permissions from `CAREGIVER` to
  `STAFF`.
- Rename active Prisma `Role` enum value to `STAFF` and add a committed
  migration for existing databases.
- Update frontend backend-role type and role mapping tests to use `STAFF`.
- Update active docs/tests/rules that describe current frontend/backend role
  naming.
- Capture failing-first evidence before production edits and final CLI/data
  surface evidence proving active references are gone.

## Must Not Have

- No compatibility alias that keeps `CAREGIVER` as an accepted current
  frontend/backend role.
- No weakening auth/session/RBAC tests.
- No backend startup migrations or `db push`.
- No broad API route convention work in this slice.
- No edits to unrelated user changes such as `.codex/config.toml`.

## Acceptance

- Active frontend/backend source, tests, current docs, and Prisma schema use
  `STAFF` rather than `CAREGIVER`.
- Staff role behavior still allows personal login and monitor view, and does not
  grant facility admin capability.
- Prisma Client generation and targeted backend/frontend auth tests pass.
- Final evidence includes a real CLI/data scan and cleanup receipt.
