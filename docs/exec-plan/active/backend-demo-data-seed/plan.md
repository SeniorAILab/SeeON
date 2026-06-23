---
slug: backend-demo-data-seed
status: active
---

# Backend Demo Data Seed

## Goal
Replace the tiny backend demo seed with the 녹양역점 demo facility data that the
frontend mock used during PoC, while keeping real backend auth/session flows.

## Decisions
- `seniorsailab@gmail.com` is the 녹양역점 backend `ADMIN`.
- The Kakao account labelled `rhqjatn310@kakao` becomes `SUPER_ADMIN` only
  through explicit binding after the actual DB `kakaoId` or Kakao email row is
  known.
- No broad Kakao OAuth auto-promotion.
- No schema expansion for frontend-only mock concepts.

## Steps
1. Add fixture tests for 녹양역점 ids, counts, zones, residents, assignments, and
   duplicate-id failure.
2. Add backend Prisma fixture data for facility, floors, spaces, zones,
   residents, assignments, guardians, cameras, and resident statuses.
3. Refactor the seed to upsert that fixture idempotently and seed
   `seniorsailab@gmail.com` as `ADMIN`.
4. Restrict `demo:bind` to exact Kakao id/email, add dry-run/audit output, and
   keep it fail-closed.
5. Update runbooks/env examples and verify with backend tests/build, release,
   direct deploy, and public HTTP smoke.
