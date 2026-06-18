# ADR-047: Canonical ingest single ingress cleanup

## Status

Accepted. Supersedes the pilot-endpoint retention clause in ADR-043.

## Date

2026-06-18

## Context

ADR-043 made `POST /ingest/alerts` the canonical backend ingress for ML-originated fall alerts, while temporarily leaving the legacy `POST /api.alerts/events` pilot endpoint in place. That pilot clause was useful during the MVP transition but leaves two possible live alert ingress paths in the visible architecture.

The current contract cleanup makes `docs/` the source of truth and removes the legacy pilot surface from the live path. Backend alert policy, persistence, deduplication, and delivery remain backend-owned under ADR-035, ADR-037, ADR-038, ADR-043, and ADR-044.

## Decision

`POST /ingest/alerts` is the only live backend alert ingress.

Concretely:

- Remove `POST /api.alerts/events` from the live backend API contract.
- Do not route ML demo, frontend, operators, or production integrations through `/api.alerts/events`.
- Keep `/ingest/alerts` as the single path that creates or repairs the RLS `Alert` read-model, SSE update, `AlertEvent`, and per-recipient `DeliveryAttempt` outbox for one idempotent event.
- Treat the ADR-043 sentence that retained `POST /api.alerts/events` as a pilot endpoint as superseded by this ADR.
- Any future non-ML alert source must either use `/ingest/alerts` with an explicit source contract or receive a new ADR before adding another live ingress.

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
- Rejected: `/ingest/alerts` better describes machine-originated alert ingestion.

## Consequences

- ADR-043 remains active for the canonical ingest transaction and repair semantics, except its pilot-endpoint retention clause is superseded.
- The decisions index must show ADR-043 as partially superseded by ADR-047.
- Backend tests and callers that still assert `/api.alerts/events` as live contract must migrate to `/ingest/alerts` or be removed.
- The visible API surface has one alert ingress, reducing duplicate delivery and read-model divergence risk.
