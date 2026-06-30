---
slug: fall-prd-api-migration-first-half
status: active
author: codex
date: 2026-06-30
---

# Fall PRD API Migration First Half

## Scope

Migrate the existing auth/session/OAuth/Kakao callback surface from the current unversioned `/auth/*` exception to the PRD convention `/api/v1/auth/*`.

This run updates only the already-existing auth API surface, frontend auth callers, tests, and API convention docs. It does not add new product features.

## PRD Anchors

- Product API routes must live under `/api/v1/*`; auth and Kakao callback are not exceptions.
- Frontend API adapters should use the normal `/api/v1` base instead of route-specific bypasses.
- Health/probe/docs routes are not product API conventions and are out of scope for this migration.

## Planned Changes

1. Change failing tests first so they assert:
   - `GET /api/v1/auth/session` reaches auth and returns `401` without a valid session.
   - `GET /auth/session` returns `404`.
   - OAuth state cookie path is `/api/v1/auth`; session cookie path remains `/`.
   - Frontend auth requests resolve to `/api/v1/auth/*` without an auth-only prefix bypass.
2. Remove the backend global-prefix `auth/(.*)` exclusion and move auth controller routes off `VERSION_NEUTRAL`.
3. Remove the frontend `apiPrefix:false` escape hatch if no longer needed.
4. Align API docs that currently describe `/auth/*` as the active convention.
5. Verify with targeted backend/frontend tests, static grep, and live HTTP QA.
6. Commit, push branch `codex/api-v1-auth-migration`, and open a draft PR.

## Guardrails

- Do not implement alert lifecycle, event DTO, facility membership, invite, camera, clip, HMAC, dashboard, or policy changes.
- Do not leave compatibility aliases for `/auth/*`.
- Do not create new dependencies.
- Keep changes small and behavior-preserving except for the intentional route migration.

## Verification

- Backend route/auth/cookie tests prove the server route contract.
- Frontend API adapter tests prove callers use `/api/v1/auth/*`.
- Static grep proves stale active-route docs and route-prefix bypasses are gone.
- Live backend curl evidence proves `/api/v1/auth/session` reaches auth and `/auth/session` is not retained.

ULW audit state: `.omo/ulw-loop/fall-prd-api-migration-first-half/`.
