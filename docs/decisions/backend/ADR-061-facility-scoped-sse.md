# ADR-061: Facility-Scoped SSE

Status: Accepted
Date: 2026-06-21
Refines: ADR-034 clauses that name org-scoped SSE subscription, replay, and payload fields.

## Context

The Front-Based API Frame plan standardizes tenant terminology on facility. PR1 is a behavior-preserving backend rename only; the SSE transport, canonical route, and replay model remain unchanged.

SSE streams are authenticated by the session cookie and scoped to the tenant associated with that session.

## Decision

Rename SSE tenant scope from `orgId` to `facilityId` in subscribe/replay code and status-event payloads.

Keep the canonical SSE route unchanged: `GET /api/sse`. Do not introduce a new ingress namespace or facility-prefixed SSE path.

Use `RequireFacilityGuard` and facility-scoped replay/subscription checks for the existing stream.

## Drivers

- Preserve the live dashboard transport contract while aligning tenant naming.
- Avoid unnecessary route churn for the canonical SSE endpoint.
- Keep replay isolation tied to the authenticated session facility.
- Maintain the same alert/status event ordering and Last-Event-ID behavior.

## Alternatives

- Rename the route to `/api/facilities/:facilityId/sse`. Rejected because scope is session-derived and no client-selected facility id should be accepted.
- Keep `orgId` in SSE payloads as a compatibility alias. Rejected because PR1 performs a full backend tenant-terminology rename.
- Create a new ingress namespace for SSE. Rejected because SSE is dashboard egress, not ingest ingress.

## Consequences

- SSE clients continue connecting to `GET /api/sse`.
- Alert and status payloads expose `facilityId` instead of `orgId`.
- Replay queries run inside `withFacilityContext` for the authenticated facility.
- Future realtime documentation and tests must refer to facility-scoped SSE.
