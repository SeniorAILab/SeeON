# ADR-058: Facility Placement Domain Model

Status: Accepted
Date: 2026-06-21
Refines: ADR-031 clauses that model placement as free-form resident room text or otherwise treat room placement outside the Facility/Floor/Space/Zone domain.

## Context

The front domain model already describes facility placement with floors, spaces, and zones. The backend previously only stored a facility root and legacy resident `room` text, so placement data could not be tenant-isolated, validated by composite foreign keys, or exposed as RESTful resources.

PR2 introduces the placement base needed before resident assignment work. Residents and historical assignments remain out of this ADR's implementation scope.

## Decision

Add immutable facility metadata: `Facility.code` as a unique slug, plus nullable `address` and `phone`. `Facility` remains the tenant root and is gated at the application layer, not enrolled in RLS.

Add three tenant tables:

- `Floor`: facility-scoped building floor with `name`, `orderIndex`, and `isActive`.
- `Space`: facility-scoped room/common area under a floor with `type`, `capacity`, nullable transitional `cameraId`, `isActive`, and optional `assignedStaff`.
- `Zone`: facility-scoped named area under a space with `type` (`BED` or `AREA`) and `orderIndex`.

Each tenant table has a composite unique key on `(facility_id, id)` and a natural facility-scoped uniqueness rule. Child relations use composite foreign keys that include `facility_id`: `Space(facility_id, floor_id)` references `Floor(facility_id, id)`, and `Zone(facility_id, space_id)` references `Space(facility_id, id)`. This makes cross-facility child placement structurally impossible.

Expose CRUD through `/api/floors`, `/api/spaces`, `/api/zones`, and `/api/facilities/current`. Controllers derive facility scope from the authenticated session. Request bodies never supply authoritative `facilityId`; presenters return camelCase product DTOs matching the front SSOT.

## Drivers

- Structural tenant isolation by construction.
- Reviewable PR2 scope before resident assignments.
- Product API casing consistency.
- Honest nullable `Space.cameraId` until the camera-to-space remodel lands.

## Alternatives

- Keep resident `room` as the only placement field. Rejected because it cannot enforce tenant-coherent placement or support zones.
- Use single `Room` table only. Rejected because the front and operations model require common spaces and zones, not just rooms.
- Add camera foreign key on `Space.cameraId` immediately. Rejected because camera-to-space remodel is a later slice; this PR keeps the field transitional and nullable.

## Consequences

- New placement tables must be enrolled in RLS with `app.facility_id` and accessed through `withFacilityContext`.
- Floor deletion is hard-delete only when no active spaces remain.
- Space deletion is a soft delete (`isActive=false`) and returns the updated resource.
- Zone deletion is hard delete in PR2; active-assignment conflict behavior belongs to the resident assignment slice.
