# ADR-024: ML Demo Surface Is Not the Product Frontend

## Status

Accepted. Supersedes the Streamlit-demo/product-frontend boundary clauses of [ADR-003](../ml/ADR-003-ml-serving-training-split.md). ADR-003 remains as the preserved historical source record.

## Date

2026-06-13

## Context

The repository contains both a Streamlit demo under `ml/demo/` and a product frontend under `front/`. ADR-003 originally recorded that the Streamlit demo is a PoC/ML harness and must not be confused with the product UI. That boundary is independent from the ML serving/training lifecycle and from the ML/backend prediction boundary, so it is split here as its own active common decision.

## Decision

`ml/demo/` is an ML demo and developer observation surface. It is not the product frontend.

- `ml/demo/` may exercise inference paths locally, visualize model behavior, and support ML/operator experimentation.
- `front/` is the product browser UI/dashboard surface.
- Product caregiver workflows, alert feeds, and durable user-facing dashboard behavior belong to `front/` and `backend/`, not to the Streamlit demo.
- Demo shortcuts are allowed only when they remain clearly demo-scoped and do not become product contracts.

## Strict common gate

This ADR belongs in `common/` because it remains irreducibly cross-domain after splitting:

- `ml/` owns the demo harness and must label it as non-product.
- `front/` owns the product UI and must not inherit Streamlit demo constraints accidentally.
- `backend/` owns product alert/persistence behavior that demo surfaces may bypass for experimentation.

No single ecosystem-local folder captures all three obligations without hiding a boundary.

## Alternatives Considered

### Treat the Streamlit demo as the product frontend

Rejected. Streamlit is a PoC/ML observation tool with local/operator assumptions, not the long-term caregiver dashboard technology.

### Remove the demo once `front/` exists

Rejected. The demo remains valuable for ML iteration and operator/model observation even when the product UI grows.

### Leave the distinction implicit in code comments

Rejected. Future plans can easily mistake a working demo flow for a product contract; the distinction is expensive to reverse once product behavior accretes around it.

## Consequences

**Positive:**

- Demo work can move quickly without being mistaken for product UX commitment.
- Product frontend decisions stay in `front/`/backend plans and future ADRs.
- Reviewers have an explicit boundary when deciding whether a UI change is ML demo or product surface work.

**Negative / trade-offs:**

- Similar screens may exist in both Streamlit and Next.js until product UI catches up.
- Plans must say which surface they target rather than relying on generic “frontend/demo” wording.

## Source preservation

This ADR preserves the active Streamlit-demo/product-frontend boundary from ADR-003. ADR-003 remains intact as historical context.
