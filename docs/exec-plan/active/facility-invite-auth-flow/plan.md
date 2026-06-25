---
slug: facility-invite-auth-flow
status: active
date: 2026-06-25
owner: codex
---

# Facility Invite Auth Flow Plan

This is the canonical executable plan. `.omo/plans/facility-invite-auth-flow.md` is scratch/resume context only.

## Decisions

- Keep launch membership as `User.facilityId + User.role`.
- Add `FacilityInvitation`; do not add `FacilityMembership` in this slice.
- Restrict invite management to backend role `ADMIN`.
- Forbid all `SUPER_ADMIN` invite management in this slice; platform admin facility targeting is out of scope.
- Keep password confirmation frontend-only for invite accept; backend receives `{ name, email, phone, password }`.
- Store only invite `tokenHash`; evidence logs must mask raw invite tokens.

## Work Plan

1. Add `FacilityInvitation` schema and migration.
   - Add fields: `facilityId`, `email`, `normalizedEmail`, optional `phone`, optional `name`, `role`, `tokenHash`, `expiresAt`, `acceptedAt`, `revokedAt`, `invitedByUserId`, timestamps.
   - Map `normalizedEmail` to `normalized_email`; service code writes `email.trim().toLowerCase()`.
   - Add a manual partial unique index:
     `CREATE UNIQUE INDEX facility_invitations_pending_email_unique ON facility_invitations (facility_id, normalized_email) WHERE accepted_at IS NULL AND revoked_at IS NULL;`
   - Accepted or revoked invites must allow re-invite.
   - Verify:
     - `pnpm prisma:migrate`
     - `pnpm prisma:generate`
     - `scripts/backend-guard/check-schema-migration.sh base origin/main`

2. Add backend invitation admin API.
   - `POST /api/facilities/current/invitations`
   - `GET /api/facilities/current/invitations`
   - `POST /api/facilities/current/invitations/:invitationId/revoke`
   - Require session, facility context, and backend role `ADMIN`.
   - `CAREGIVER` and all `SUPER_ADMIN` users return 403.
   - Generate secure random token; persist only hash; return raw invite URL only in create response.
   - Tests: admin create/list/revoke, caregiver forbidden, super-admin forbidden, duplicate pending invite rejected, accepted/revoked re-invite allowed, persisted row has no raw token.

3. Add public invitation validation and accept API.
   - `GET /auth/invitations/:token`
   - `POST /auth/invitations/:token/accept`
   - Validation returns non-sensitive facility/invite summary.
   - Accept request body is `{ name, email, phone, password }`.
   - Accept must atomically claim the invite with an `updateMany` condition where `acceptedAt` and `revokedAt` are null and `expiresAt > now`.
   - In the same transaction, create one facility-bound `CAREGIVER`, mark the invite accepted, issue `app_session`, and reject concurrent double-submit.
   - Tests: success sets cookie, expired token stable error, reuse conflict, wrong email bad request, existing email conflict, two simultaneous accepts produce exactly one success.

4. Add frontend invite accept flow.
   - Add `/invite/:token`.
   - Do not ask for facility name or role.
   - Validate password confirmation in the UI only.
   - Send only `{ name, email, phone, password }` to backend.
   - Tests: no facilityName field, password confirmation validation, expired invite error, successful accept stores session and navigates `/now`.

5. Add admin users invitation UI.
   - Create invite, list invite status, copy masked/log-safe invite URL, revoke pending invite.
   - Use existing admin users surface.
   - No role selector unless it is fixed to caregiver.
   - Tests: admin creates invite and receives URL, caregiver cannot access admin users route, revoke updates row state.

6. Update docs.
   - ADR-071 remains the login/auth SSOT.
   - `docs/api/route-inventory.md` lists all invitation routes.

7. Run final verification.
   - Backend targeted tests.
   - Frontend targeted tests.
   - `pnpm typecheck`
   - `pnpm --filter backend run dto:check`
   - `scripts/backend-guard/check-schema-migration.sh base origin/main`
   - backend/frontend lint
   - `git diff --check`
   - live HTTP QA and browser QA with masked token evidence under `.omo/evidence/facility-invite-auth-flow/`.

## Agent-Executable QA

The executor must create temporary QA drivers under `.omo/evidence/facility-invite-auth-flow/`:

- `http-qa.mjs`
  - Creates/logs in a unique owner through `POST /auth/register`.
  - Stores cookies in memory.
  - Creates an invite through `POST /api/facilities/current/invitations`.
  - Masks invite token before writing logs.
  - Accepts the invite through `POST /auth/invitations/:token/accept`.
  - Verifies `/auth/session` returns a `CAREGIVER` with `facilityId`.
  - Negative modes cover reuse, malformed token, caregiver invite-create, and SUPER_ADMIN invite-create.

- `browser-qa.mjs`
  - Opens `http://localhost:3000/admin/users` as admin and creates an invite.
  - Opens `http://localhost:3000/invite/<token>`, fills the accept form, submits, and verifies URL `/now`.
  - Opens expired invite URL and verifies stable error state.
  - Opens `/admin/users` as caregiver and verifies redirect to `/now`.
  - Writes screenshots to `.omo/evidence/facility-invite-auth-flow/task-*.png`.

Required commands:

```bash
pnpm --filter backend test -- auth.controller.spec.ts auth.service.spec.ts auth.spec.ts facility-invitations --runInBand
pnpm --filter front test -- InviteAcceptPage.test.tsx UsersPage.test.tsx authEndpoints.test.ts authService.test.ts
pnpm typecheck
pnpm --filter backend run dto:check
scripts/backend-guard/check-schema-migration.sh base origin/main
pnpm --filter backend lint
pnpm --filter front lint
git diff --check
node .omo/evidence/facility-invite-auth-flow/http-qa.mjs full-flow
node .omo/evidence/facility-invite-auth-flow/http-qa.mjs negative-flow
node .omo/evidence/facility-invite-auth-flow/browser-qa.mjs full-flow
```

## Guardrails

- Do not add separate login pages.
- Do not add caregiver public signup.
- Do not reintroduce business registration number.
- Do not persist or commit raw invite tokens.
- Do not auto-provision users from generic Kakao login.
- Do not amend existing commits unless explicitly requested.

## Success Criteria

- Public `/signup` creates only facility owner `ADMIN`.
- `ADMIN` can create/list/revoke caregiver invite links for their facility.
- `CAREGIVER` and all `SUPER_ADMIN` users cannot create/list/revoke invitations in this slice.
- Public invite accept creates a facility-bound `CAREGIVER`, sets backend `app_session`, and routes frontend to `/now`.
- Expired, revoked, accepted/reused, malformed, wrong-email, and concurrent double-submit tokens fail without extra session issuance.
- `/login` remains role-agnostic and Kakao generic login still rejects unregistered Kakao users.
- ADR-071 and route inventory document the final auth/invite contract.
- Evidence files mask invite tokens.
