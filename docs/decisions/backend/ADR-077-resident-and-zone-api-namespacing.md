# ADR-077: Resident and zone API namespacing

## Status

Accepted

## Date

2026-06-27

## Context

The room-centric model (ADR-065) and the REST/layering convention (ADR-046)
treat the resident as the product's core entity and the facility topology
(Floor → Space → Zone) as shared infrastructure referenced by cameras, events,
alerts, and assignments. Two surfaces had drifted from that model:

- **Resident assignments were split across two modules.** `residents/` owned the
  aggregate (CRUD plus per-resident `GET/PUT /residents/:id/assignment`), while a
  separate `resident-assignments/` module exposed a cross-resident
  `GET /api/v1/resident-assignments` list. That second module duplicated the
  assignment list query and the `presentAssignment` mapper, and the residents
  repository carried a parallel dead `listHistory()` method (defined and mocked,
  never called). The `/resident-assignments` top-level path also presented a
  sub-concept of the resident as a sibling resource.

- **Zones were a top-level resource.** `Zone` is a weak entity (BED/AREA) that has
  no meaning outside its `Space`, yet `/api/v1/zones` sat at the top level with
  `spaceId` passed as a query/body field. The frontend's `zoneService` already
  documented the intended real path as `/api/spaces/:id/zones`.

`resident-risk-summaries/` and `space-statuses/` are deferred read-model stubs
(guarded `501` until the read model lands) and are intentionally separate, thin,
consistent twins; they are out of scope here.

## Decision

Namespace both surfaces under their owning aggregate. Database tables stay
normalized (`Floor`, `Space`, `Zone`, `Resident`, `ResidentAssignment` keep their
own RLS-protected tables and composite FKs); only module and route surfaces
change.

- **Fold `resident-assignments/` into `residents/`.** Delete the module
  (controller, service, repository, DTO, spec). The cross-resident list is served
  by `ResidentsController` at `GET /api/v1/residents/assignments`, declared before
  `@Get(':id')` so the literal route is not captured as a resident id. The
  duplicate `presentAssignment` is removed; the residents repository's dead
  `listHistory()` is renamed to `listAssignments()` and wired through
  `ResidentsService.listAssignments`.

- **Nest zone routes under spaces.** Route the zones controller at
  `/api/v1/spaces/:spaceId/zones` and `/api/v1/spaces/:spaceId/zones/:zoneId`.
  `spaceId` is read from the path on every verb; create/update inject the path
  `spaceId`, so a zone cannot be moved across spaces through the nested route. The
  `zones/` module, service, and repository signatures are unchanged.

- **DB-level RLS spec retained.** `backend/src/resident-assignments.rls.spec.ts`
  is a table-level tenant-isolation test with no module dependency and stays.

## Alternatives Considered

### Keep `resident-assignments` and top-level `/zones` as-is

- Pros: no churn.
- Cons: leaves duplicated assignment query/presenter and dead repository code, and
  keeps sub-concepts as top-level resources that contradict the room-centric model.
- Rejected: the duplication is a real maintenance hazard and the naming misleads.

### Collapse `floors`/`spaces`/`zones` into one `topology` module

- Pros: fewer API surfaces; floor plan is arguably one aggregate.
- Cons: larger blast radius; floors and spaces are substantial independent CRUD
  surfaces referenced widely.
- Deferred: only the weak-entity `zones` nesting is taken now; a full topology
  module merge can be decided later.

### Denormalize room/floor onto the resident

- Pros: a single resident-centric write shape.
- Cons: topology is shared infrastructure (cameras, events, alerts reference
  `spaceId`); embedding it in the resident creates back-references and breaks on
  floor-plan changes.
- Rejected: the resident-centric "where is each resident" view is a read-model
  concern (CQRS-lite), not a reason to denormalize the write model.

## Consequences

- The resident folder and API path are unified under `residents/`; zone REST now
  reflects its containment in a space.
- API contract changes:
  - `GET /api/v1/resident-assignments` → `GET /api/v1/residents/assignments`.
  - `/api/v1/zones`, `/api/v1/zones/:zoneId` → `/api/v1/spaces/:spaceId/zones`,
    `/api/v1/spaces/:spaceId/zones/:zoneId`.
- Real frontend clients are unaffected: `zoneService` is mock-only and already
  targeted `/api/spaces/:id/zones`, and no real client called
  `/resident-assignments`.
- Docs updated: `docs/api/dashboard-api.md`, `docs/api/route-inventory.md`,
  `backend/src/AGENTS.md`.
- Complements ADR-065 (room-centric data model), ADR-046 (REST/layering), and
  ADR-058 (facility placement domain). Supersedes nothing.
