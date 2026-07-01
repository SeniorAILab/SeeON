---
slug: frontend-role-journey-prd
status: superseded-by
superseded-by: frontend-monitor-dashboard-mece
date: 2026-07-01
owner: codex
---

# Frontend Role Journey PRD Plan

## Intent

Implement the approved hybrid UI journey:

`super_admin system dashboard -> facility selection -> facility Admin View / Staff View -> separate Monitor Display`.

This plan also patches the Obsidian <vault> PRD so the product source of truth matches the route and UI work.

## Decisions

- `super_admin` lands on `/super-admin`; no silent demo facility fallback.
- Facility selection navigates to `/facilities/:facilityId/admin/dashboard`.
- Facility Admin View and Staff View are canonical URL surfaces, not hidden global state modes.
- Staff Dashboard replaces `/now`; `/now` is not a product default or navigation path.
- Monitor Display is facility-scoped and separate from role dashboards: `/monitor/:facilityId`, `/monitor/:facilityId/floors/:floorId`, `/monitor/:facilityId/all`.
- `/poc/2f` is removed from normal access; product monitor routes absorb its value.
- Dashboard APIs remain read-model/query only. Domain mutations remain in owning APIs.
- React dev tooling may be installed/wired if needed; no production runtime dependency may be introduced for tooling.

## Work Plan

1. Patch the <vault> PRD.
   - Add explicit super admin landing, facility selection, Admin/Staff View switching, monitor display, `/now` removal, `/poc` absorption, and TTS acceptance wording.
   - Keep dashboard API as read-model/query only and no operator API.

2. Add failing-first frontend route tests.
   - Prove `SUPER_ADMIN` no longer defaults to `/admin/dashboard`.
   - Prove `STAFF` no longer defaults to `/now`.
   - Prove unauthorized admin access does not silently land on `/now`.
   - Prove `/poc/2f` is not a normal route.

3. Add canonical route builders and access helpers.
   - Centralize `/super-admin`, `/facilities/:facilityId/admin/*`, `/facilities/:facilityId/staff/*`, and `/monitor/:facilityId/*`.
   - Make missing facility context explicit rather than falling back to `fac_happy_nokyang`.

4. Rewire router page-level structure first.
   - Add `SuperAdminDashboardPage`, `FacilityRouteSync`, `AccessDeniedPage`, and recovery routes.
   - Mount existing admin pages under facility-scoped admin routes.
   - Mount existing staff pages under facility-scoped staff routes.
   - Mount monitor selector/floor/all under facility-scoped monitor routes.
   - Remove normal `/now` and `/poc/2f` access.

5. Update shell components after route structure.
   - Admin topbar shows facility context, System Dashboard link for super admin, Admin/Staff segmented switch, and Monitor Display entry.
   - Staff shell nav uses Staff Dashboard, Rooms, Alerts under facility route; remove `2층 현황` PoC button.
   - Monitor header/selector uses explicit exit instead of browser-history back.

6. Update dashboard/facility API seams narrowly.
   - Keep current backend composition path unless backend read-model endpoints already exist.
   - Pass explicit facility context through frontend services where supported.
   - Remove product fallback to demo facility from route-owned surfaces.

7. Update focused tests and docs drift.
   - Update route/auth/layout tests.
   - Add tests for route builders, facility selection navigation, and monitor scoped paths.
   - Update repo docs that directly contradict the PRD if touched by this slice.

8. Verify.
   - `pnpm --filter front test`
   - `pnpm --filter front typecheck`
   - `pnpm --filter front lint`
   - Browser QA on `/super-admin`, selected admin view, staff view, monitor selector/floor display, direct `/now`, direct `/poc/2f`.
   - Visual QA reviewer pass with screenshots.

## Guardrails

- Do not add an operator domain/controller/API.
- Do not make dashboard APIs mutate.
- Do not normalize auth routes in this slice.
- Do not expose staff-facing model scores, camera IDs, or live CCTV.
- Do not rely on browser history as the only monitor exit.
- Do not touch unrelated dirty files.

## Success Criteria

- Super admin login path and role defaults point to `/super-admin`.
- Facility selection visibly enters a selected facility workspace.
- Admin View and Staff View switch mutually inside selected facility context.
- Staff Dashboard is canonical and `/now` is not a default/nav/test expectation.
- Monitor Display is a facility/floor display mode with explicit exit.
- `/poc/2f` is not reachable through normal product navigation.
- <vault> PRD directly records the final UI journey and dashboard API convention.
