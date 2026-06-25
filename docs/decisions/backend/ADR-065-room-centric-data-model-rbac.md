# ADR-065: Room-Centric Data Model and 3-Tier RBAC

Status: Accepted
Date: 2026-06-22
Supersedes: ADR-031 clauses that model `Camera` as resident-bound, require `Alert.residentId`, store placement in `Resident.room`, or define `Role` as `OWNER | ADMIN`; ADR-032 clauses that depend on those camera/resident and required-alert-resident foreign keys; ADR-058's transitional `Space.cameraId` clause, now resolved by the camera-to-space remodel landing path.

## Context

The backend schema still carries the original resident-centric MVP shape: cameras can point at residents, alerts require a resident, residents have free-text `room`, and backend roles are `OWNER | ADMIN`. That conflicts with the accepted operating model: cameras are installed in rooms, rooms can contain zero or many residents over time, the person who fell can be unknown, and caregivers do not receive personal login accounts.

The current facility placement model already introduced `Floor`, `Space`, and `Zone` with facility-scoped composite keys and forced RLS. ADR-058 intentionally kept `Space.cameraId` nullable and transitional until the camera-to-space remodel could land. This ADR closes that transition and makes `Space` the physical anchor for cameras and alert history.

The implementation must preserve tenant isolation and data safety while replacing expensive-to-reverse persistence contracts. Therefore the remodel is delivered as expand-contract migrations with strict, evidence-based backfills and blocking prechecks before destructive drops.

## Decision

Adopt a room-centric backend data model:

- `Camera` belongs to exactly one `Space` through `Camera.spaceId`, a NOT NULL facility-scoped composite foreign key to `Space(facility_id, id)`.
- `Camera.spaceId` is unique per facility so one room has at most one camera; `Camera.residentId` is removed after compatibility code is off the old relation.
- `Alert` is anchored to the room through NOT NULL `Alert.spaceId`. `Alert.cameraId` remains a nullable source-device reference, and `Alert.residentId` becomes nullable because an alert may be room-only or unknown-person.
- Resident placement is represented only by `ResidentAssignment`; `Resident.room` is removed as placement authority.
- Historical alert room anchoring is stored, not derived at read time, so camera replacement and resident movement do not rewrite past alerts.

Adopt a 3-tier backend role model and one RBAC source of truth:

- `Role` is exactly `SUPER_ADMIN | ADMIN | CAREGIVER`.
- `SUPER_ADMIN` and `ADMIN` are personal login roles.
- `CAREGIVER` represents a care-home shared TV/dashboard view and does not imply a personal caregiver account.
- Backend permission checks use a single RBAC SSOT, with an explicit backend-to-front role mapper for frontend compatibility.

Use expand-contract rollout:

1. Expand with new nullable columns or enum compatibility where needed.
2. Backfill only from strict physical-room or historical-placement evidence.
3. Verify RLS, composite FKs, uniqueness, runtime consumers, and session compatibility.
4. Contract with NOT NULL constraints and destructive drops only after blocking prechecks pass.

## Drivers

- Physical truth: a camera is installed in a room, while residents can move and rooms can be empty.
- Historical correctness: an alert must keep the room at detection time even after camera replacement or resident reassignment.
- Tenant isolation: new room anchors must preserve the `facility_id` composite FK pattern, forced RLS, and `app.facility_id` fail-closed runtime guard.
- Reviewable migration safety: destructive drops of `Camera.residentId`, `Resident.room`, `Space.cameraId`, and required `Alert.residentId` semantics must be isolated behind evidence-based backfills.
- Access-model consistency: backend roles must match the accepted `SUPER_ADMIN | ADMIN | CAREGIVER` model while preserving the fact that caregivers are not personal-login principals.

## Alternatives

- Big-bang migration. Rejected because it couples enum changes, backfills, runtime behavior, and destructive drops into one rollback-hostile PR. Expand-contract keeps each invariant reviewable and lets unresolved data block before loss.
- Keep `Space.cameraId` as the durable FK direction. Rejected because it was only transitional in ADR-058, conflicts with the target `Camera.spaceId` model, and makes camera lifecycle and uniqueness harder to enforce from the device side.
- Derive alert room at read time from camera or current assignment (Option F). Rejected because it rewrites history after camera replacement or resident moves and cannot represent empty-room or unknown-person alerts reliably.
- Keep 2-tier `OWNER | ADMIN`. Rejected because the accepted access model requires `SUPER_ADMIN | ADMIN | CAREGIVER`, a backend RBAC SSOT, and a non-personal caregiver TV/dashboard view.

## Consequences

- ADR-031 remains historical for the initial schema, but its resident-bound camera, required alert resident, free-text resident room, and 2-tier role clauses are superseded for current work.
- ADR-032 remains authoritative for RLS principles, but any FK examples depending on the superseded camera/resident or required-alert-resident model are replaced by facility-scoped room anchors.
- ADR-058 remains authoritative for `Floor`/`Space`/`Zone`; its nullable `Space.cameraId` transition is resolved by the `Camera.spaceId` expand-contract path and eventual `Space.cameraId` removal.
- `ResidentStatus` remains resident-centric and is updated only when an alert has a resident; a room status read model is deferred rather than faked through a nullable resident.
- Existing sessions must be invalidated or versioned during role migration so old `OWNER` claims are not silently accepted under the new matrix.
- Product APIs and DTOs must expose room context consistently while keeping product API casing camelCase and ingest payloads snake_case.

## Follow-ups

- Design TV kiosk authentication for the facility-bound shared CAREGIVER dashboard view.
- Decide event taxonomy separately; `Alert.type` remains an open string and `AlertEventType` remains the ML-to-backend outbox contract for now.
- Land `DetectionEvent`, `SpaceStatus`, and `AlertRule` 501 read models after the room-centric `Alert`/`AlertEvent` boundary is stable.
- Design Kakao group-chat or AlimTalk fan-out separately; MVP remains admin send-to-me.
