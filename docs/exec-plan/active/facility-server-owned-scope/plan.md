---
slug: facility-server-owned-scope
status: active
date: 2026-07-02
owner: codex
---

# Facility Server-Owned Scope Plan

## Goal

Make tenant facility scope backend-owned. The frontend must not choose tenant
scope by exposing or sending `Facility.id`, `Facility.code`, `X-Facility-Id`, or
`facilityId` query values. `SUPER_ADMIN` remains facility-less at login and
selects a facility through a backend-issued opaque selector that persists only
in server-owned session state.

## Decisions

- Keep `Facility.id` as the internal database key only.
- Do not use customer facility codes for routing, API scope, or frontend tenant
  selection.
- `ADMIN` and `STAFF` tenant scope is derived from authenticated user/session
  state.
- `SUPER_ADMIN` tenant scope is derived from backend-owned active session state
  after explicit facility selection.
- Production bootstrap may create the same operational roles as dev, but
  production passwords must come from secrets and must not fall back to `1234`.
- Record client-side facility id/code scoping as a repo anti-pattern.

## Work Plan

1. Backend scope contract
   - Add server-owned active facility state to sessions.
   - Issue opaque facility selection tokens from backend facility listing.
   - Add a facility selection endpoint for `SUPER_ADMIN`.
   - Remove trusted `X-Facility-Id` and `facilityId` query fallback from
     facility guards.
   - Cover tampering and missing-scope cases with targeted tests.

2. Frontend route and API contract
   - Remove facility ids from user-visible route paths.
   - Stop sending facility scope headers and SSE facility query parameters.
   - Make super-admin facility selection call backend selection before
     navigating to admin/staff/monitor flows.
   - Keep login, session restore, admin, staff, monitor, alerts, logout, and
     access-denied flows working.

3. Seed/bootstrap and rules
   - Ensure `seniorsailab@gmail.com` is facility-less `SUPER_ADMIN`.
   - Ensure the Nokyang account is facility-bound `ADMIN`.
   - Fail or skip production bootstrap without explicit password secrets.
   - Update AGENTS/docs with the forbidden tenant-scope anti-pattern.

4. Verification
   - Capture failing-first proof of the old trusted client scope path.
   - Run targeted backend and frontend tests.
   - Run typecheck/lint for changed surfaces.
   - Drive the real local app through browser/visual QA before PR.

## Success Criteria

- Tampered frontend facility id/code/header/query cannot switch tenant scope.
- No visible route, request header, or SSE URL carries internal `Facility.id` or
  customer `Facility.code` for tenant scope.
- `SUPER_ADMIN` can select Nokyang and view scoped admin/staff/monitor screens.
- Nokyang `ADMIN` logs directly into the facility-bound admin flow.
- Seeds/bootstrap are idempotent and production-safe with secret-only passwords.
- The anti-pattern is documented where future agents will read it.
