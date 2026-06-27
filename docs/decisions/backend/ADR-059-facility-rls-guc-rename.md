# ADR-059: Facility RLS GUC Rename

Status: Accepted
Date: 2026-06-21
Refines: ADR-032 clauses that name `org_id`, `app.org_id`, `withOrgContext`, and org-based ingest camera lookup.

## Context

The Front-Based API Frame plan standardizes tenant terminology on facility. PR1 is a behavior-preserving backend rename only; it does not add facility profile fields or new tenant tables.

The existing multitenancy design uses tenant-scoped columns, forced RLS, a transaction-local Postgres GUC, and a SECURITY DEFINER camera lookup for ingest before a tenant context is known.

## Decision

Rename the tenant key column from `org_id` to `facility_id` and the transaction-local GUC from `app.org_id` to `app.facility_id`.

Rename the Prisma root tenant model from `Organization` to `Facility`, mapping it to the database table `facilities`. Tenant tables remain `Resident`, `Guardian`, `Camera`, `Alert`, and `ResidentStatus`; `Facility` remains the tenant root and is not in `TENANT_MODELS`.

Rename application binding APIs from `withOrgContext` to `withFacilityContext` and from `getBoundOrgId` to `getBoundFacilityId`.

Recreate `get_camera_for_ingest(TEXT)` so it selects `facility_id` and returns the `facilityId` output field. The `fall_app` role remains unchanged.

New tenant-table enrollment is deferred to PR2/PR3.

## Drivers

- Keep RLS fail-closed semantics unchanged while aligning names with the facility domain language.
- Preserve data by using table and column renames rather than table rebuilds.
- Avoid role, privilege, or runtime behavior changes in PR1.
- Keep ingest authorization independent of RLS until the camera key identifies the facility.

## Alternatives

- Keep `org_id`/`app.org_id` as database compatibility seams. Rejected because PR1 explicitly performs the full rename in one cohesive pass.
- Add new `facility_id` columns and backfill. Rejected because `ALTER ... RENAME` preserves data and constraints with less risk.
- Rename `fall_app`. Rejected because role naming is operational infrastructure, not tenant domain language.

## Consequences

- Runtime code must bind `app.facility_id` inside the same transaction used for tenant queries.
- Existing data survives the migration without copy/delete operations.
- Policy, function, test, and raw SQL references must use facility terminology.
- Future tenant tables must use `facility_id`, RLS policies on `app.facility_id`, and the `withFacilityContext` access pattern.


## PR2 Amendment: placement tenant tables

`Floor`, `Space`, and `Zone` are now tenant tables. Their migrations enable and force RLS, define `tenant_isolation` on `facility_id = current_setting('app.facility_id', true)::text`, grant CRUD privileges to `fall_app`, and enroll the Prisma models in `TENANT_MODELS`. Facility remains outside RLS as the tenant root.
