# ADR-047: Canonical ingest single ingress cleanup

## Status

Accepted. Supersedes ADR-035's separate `/api.alerts/events` ingress and ADR-043's pilot-endpoint retention clause.

## Date

2026-06-18

## Context

Supersession note: this cleanup removed the `POST /api.alerts/events` pilot and standardized the historical HMAC ingest path. The issue #388 Event API cutover later superseded that path for live ML traffic; live ingress is now `POST /api/v1/events`.

The current contract cleanup makes `docs/` the source of truth and removes the legacy pilot surface from the live path. Backend alert policy, persistence, deduplication, and delivery remain backend-owned under ADR-035, ADR-037, ADR-038, ADR-043, and ADR-044.

## Decision

Historical decision: the HMAC alert route was the only live backend alert ingress for that phase.

Concretely:

- Remove `POST /api.alerts/events` from the live backend API contract.
- Do not route ML demo, frontend, operators, or production integrations through `/api.alerts/events`.
- Historical: keep the HMAC alert route as the single path for that phase; live traffic now enters through `POST /api/v1/events`.
- Treat the ADR-035 separate `POST /api.alerts/events` ingress and the ADR-043 sentence that retained `POST /api.alerts/events` as a pilot endpoint as superseded by this ADR.
- Any future non-ML alert source must receive an explicit source contract or a new ADR before adding another live ingress.

## Alternatives Considered

### Keep `/api.alerts/events` as an undocumented compatibility endpoint

- Pros: avoids immediate caller migration work.
- Cons: preserves a second side-effecting ingress outside the canonical contract and invites hidden drift.
- Rejected: hidden compatibility endpoints are incompatible with a docs-owned API contract.

### Reposition `/api.alerts/events` as an internal provider callback

- Pros: leaves a place for future event-provider integrations.
- Cons: no current live owner requires it, and the path shape conflicts with ADR-046.
- Rejected: future provider callbacks should be designed from their actual source and security requirements.

### Make `/api/alerts/events` the canonical path instead

- Pros: fits the product API prefix.
- Cons: blurs machine ingest with frontend product resources and would churn the already-established ingest contract.
- Rejected then: the HMAC alert route better described machine-originated alert ingestion for that phase.

## Consequences

- ADR-035 remains active for backend-owned alert policy, idempotency, persistence, and dispatch ownership, except its separate `/api.alerts/events` ingress is superseded.
- ADR-043 remains active for the canonical ingest transaction and repair semantics, except its pilot-endpoint retention clause is superseded.
- The decisions index must show ADR-035 and ADR-043 as partially superseded by ADR-047.
- Backend tests and callers that still assert `/api.alerts/events` as live contract must migrate to the current Event API or be removed.
- The visible API surface has one alert ingress, reducing duplicate delivery and read-model divergence risk.
