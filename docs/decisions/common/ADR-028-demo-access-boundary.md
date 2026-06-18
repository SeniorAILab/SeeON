# ADR-028: Demo Access Boundary for Private Data and Public Uploads

## Status

Superseded by [ADR-045](./ADR-045-streamlit-demo-local-only.md) (2026-06-18): the Streamlit demo is local-only and the `FALL_DEMO_MODE` public/operator access-mode branching is removed. This ADR is retained as the historical access-boundary record. It originally superseded the access-boundary clauses of [ADR-012](../ml/ADR-012-ml-data-domain-first-layout.md); ADR-012 remains accepted for ML data layout.

## Date

2026-06-13

## Context

ADR-012 combined two decisions: the `ml/data/` domain-first physical layout and an access boundary for externally deployed demos. The layout decision is ML-local; the access boundary is cross-domain because it constrains ML data custody, demo behavior, and any externally reachable product/demo surface. This ADR extracts the access decision into `common/`.

## Decision

Private nursing-home data is operator-only. Public/external demo access is uploads-only and fail-safe by default.

- `ml/data/nursing-home/` contains patient-adjacent operator data and must never be listed, served, or otherwise exposed to external demo users.
- `ml/data/uploads/` is the only externally reachable input surface for deployed demo-style inference.
- External testers may run inference only on clips uploaded in their own session.
- Demo mode must fail safe: public mode hides internal sources by default; operator access requires explicit opt-in.

This ADR does not change ADR-012's physical layout. It extracts the access boundary so future product/demo deployment work can find and review it independently from ML data-folder mechanics.

## Strict common gate

This ADR belongs in `common/` because, after splitting ADR-012's ML layout decision away, the access boundary still irreducibly constrains more than one domain:

- `ml/` owns private data and upload intake paths.
- Demo/product surfaces must not expose operator-only data.
- Backend/frontend deployment plans must respect uploads-only external access when they introduce externally reachable surfaces.

A purely `ml/` placement would hide obligations on user-facing surfaces; a purely frontend/backend placement would hide the data-custody source of the restriction.

## Alternatives Considered

### Expose internal nursing-home clips in public demo mode

Rejected. The footage is patient-adjacent and operator-controlled; exposing it would violate the privacy perimeter established by data custody ADRs.

### Rely on operator discipline or environment comments only

Rejected. External exposure defaults must be fail-safe. A forgotten environment variable or misunderstood deployment mode must not leak private data.

### Treat uploaded clips as a domain folder

Rejected by ADR-012 and preserved here. Uploads are transient, session-scoped external inputs, not a durable dataset domain with raw/processed/poses/annotated roles.

## Consequences

**Positive:**

- Future deployment plans can review access policy without reading the entire ML data-layout ADR.
- Privacy-sensitive data boundaries remain explicit and cross-domain.
- Public/demo operation has a simple safe default: uploads only.

**Negative / trade-offs:**

- Demo code and docs must distinguish operator mode from public mode wherever sources are listed.
- Any future hosted demo has to carry data-access verification, not just inference correctness.

## Source preservation

This ADR preserves the access-boundary decision from ADR-012. ADR-012 remains intact and accepted for the ML data layout; its historical access-boundary context is not deleted.
