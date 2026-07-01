---
slug: frontend-monitor-dashboard-mece
title: Frontend dashboard and monitor journey alignment
author: codex
created: 2026-07-01
status: active
---

# Plan

## Goal

Align the frontend IA around two non-overlapping route families:

- Dashboard: authenticated human workbench for super admin, facility admin, and staff.
- Monitor: passive/read-only facility display, defaulting to all floors.

## Route Contract

- `/dashboard` renders the super-admin system dashboard and facility selector.
- `/dashboard/facilities/:facilityId/admin` renders the selected facility admin dashboard.
- `/dashboard/facilities/:facilityId/staff` renders the selected facility staff now view.
- `/monitor/:facilityId` renders the selected facility monitor all-floors display.
- `/monitor/:facilityId/floors/:floorId` renders a single floor monitor display.
- Legacy product routes such as `/now`, `/poc/2f`, `/monitor/all`, and `/monitor/:facilityId/all` are removed from the route table.

## Steps

1. Add failing route contract tests for the new canonical helpers and defaults.
2. Update frontend route helpers, router definitions, and role redirects.
3. Update admin/staff/super-admin navigation links to the canonical dashboard and monitor routes.
4. Make monitor home the all-floors display and keep floor drilldown reusable from that surface.
5. Update the Obsidian PRD route/API journey notes to match the settled IA.
6. Verify with targeted tests, full frontend tests, typecheck, lint, build, and visual QA screenshots.
7. Commit, push, and open a PR.

## Verification

- RED: route helper tests fail before production edits.
- GREEN: frontend tests pass after route/helper changes.
- Static: TypeScript, lint, and Vite build pass.
- Browser: login plus dashboard/admin/staff/monitor-all/monitor-floor visual QA captures pass.
