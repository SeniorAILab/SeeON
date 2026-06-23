---
slug: frontend-role-route-access
status: done
author: codex
created: 2026-06-23
---

# Frontend role route access

## Problem

The Vite frontend currently protects `/admin/**` with `FACILITY_ADMIN`, but
blocked users are redirected to `/dashboard`, which is not a registered route.
Login also sends every successful user to `/now`, so facility directors and
super admins do not land in the dashboard/settings surface they are allowed to
use.

## Scope

- Make the default landing path role-aware:
  - `SUPER_ADMIN` and `FACILITY_ADMIN` -> `/admin/dashboard`
  - `STAFF` and `VIEWER` -> `/now`
- Make blocked admin access redirect to a real staff path.
- Keep staff-mode navigation available to all authenticated users.
- Keep dashboard/settings/admin routes unavailable to caregivers/staff/viewers.

## Plan

1. Add a small pure route-access helper so login and guards share one policy.
2. Add focused tests for role landing and forbidden admin redirect behavior.
3. Wire `RequireAuth` and `LoginPage` through the shared helper.
4. Run frontend tests, typecheck, and lint for the touched surface.

## Non-goals

- Backend RBAC changes.
- New route groups or visual redesign.
- New dependencies.
