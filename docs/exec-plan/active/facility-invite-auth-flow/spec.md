---
slug: facility-invite-auth-flow
status: active
date: 2026-06-25
owner: codex
---

# Facility Invite Auth Flow Spec

## Problem

The current login/signup surface is ambiguous for a B2B facility product. A facility has an owner/director and caregivers, but those are not two facility-owned accounts. They are human users scoped to one facility.

## Target Model

- `Facility` is the tenant.
- `User` is a person.
- Public `/signup` creates a new `Facility` plus the first facility `ADMIN`.
- Caregivers do not self-register by typing a facility name.
- Facility-bound `ADMIN` users invite caregivers with a server-generated invite link.
- Invite accept creates a facility-bound `CAREGIVER` and issues the same backend `app_session` used by email/password and Kakao login.
- `/login` remains one role-agnostic page. Routing comes from backend session user role and `facilityId`.

## Must Have

- Add a `FacilityInvitation` persistence model with hashed token storage.
- Add admin invitation create/list/revoke API.
- Add public invitation validate/accept API.
- Add `/invite/:token` frontend route.
- Add invitation management to the existing admin users surface.
- Preserve owner-only public signup and unregistered Kakao rejection.
- Update ADR/API docs so the login/invite flow has one SSOT.

## Must Not Have

- No separate owner/staff login page.
- No role selector on login.
- No public caregiver signup with `facilityName`.
- No `businessRegistrationNumber`.
- No raw invitation token persistence.
- No generic Kakao login auto-provisioning.
- No full `FacilityMembership` migration in this slice.
- No `SUPER_ADMIN` invite management in this slice.

## Acceptance

- A facility `ADMIN` can create/list/revoke caregiver invites for their facility.
- `CAREGIVER` and all `SUPER_ADMIN` users cannot create/list/revoke invites.
- Invite accept creates exactly one facility-bound `CAREGIVER` session.
- Reused, expired, revoked, malformed, wrong-email, and concurrent double-submit tokens fail safely.
- Browser QA proves admin invite creation and staff invite acceptance through the real frontend.
