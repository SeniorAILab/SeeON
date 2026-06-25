# ADR-060: Facility Session Claim and Onboarding

Status: Accepted
Date: 2026-06-21
Supersedes: ADR-033 clauses that name the org/session claim, org-scoped user binding, and `/api/orgs` onboarding route.

## Context

The Front-Based API Frame plan standardizes tenant terminology on facility. PR1 is a behavior-preserving backend rename only; authorization roles and onboarding semantics stay the same.

Before onboarding, a Kakao-authenticated user has no tenant scope. After onboarding, backend sessions carry the tenant scope used by guards and tenant-bound database access.

## Decision

Rename the JWT/session/user tenant claim from `orgId` to `facilityId`.

Retain the `OWNER` and `ADMIN` roles. Scope remains session-derived: authenticated routes read `facilityId` from the validated session/user, not from request bodies.

Rename onboarding from `POST /api/orgs` to `POST /api/facilities`. The request body supplies the facility name and optional business registration number only; it does not supply `facilityId`.

Rename onboarding/service identifiers from organization/org to facility, including `createFacilityForUser`, `CreateFacilityRequestDto`, and facility-required guard messages.

## Drivers

- Align external and internal auth contracts with facility terminology.
- Preserve session-derived authorization and prevent client-selected tenant scope.
- Keep existing Kakao login, onboarding, and role behavior unchanged.
- Make the renamed backend contract explicit for following frontend work.

## Alternatives

- Accept both `orgId` and `facilityId` claims during a compatibility window. Rejected because PR1 is a coordinated backend rename and the generated/client code must converge on one field.
- Keep `/api/orgs` as an alias. Rejected because the API frame requires the canonical onboarding route to be `/api/facilities`.
- Add body-level `facilityId` for onboarding. Rejected because tenant scope must be server-created/session-derived.

## Consequences

- Session token creation and validation compare `facilityId` across token, user, and server session rows.
- Users without `facilityId` continue to be redirected to onboarding.
- Facility-required routes reject unauthenticated sessions or sessions with no facility using facility terminology.
- Frontend callers must use `POST /api/facilities` after PR1 is integrated with frontend route updates.
