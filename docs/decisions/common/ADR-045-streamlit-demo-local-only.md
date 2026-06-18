# ADR-045: Streamlit demo is local-only — demo access-mode branching removed

## Status

Accepted. Supersedes [ADR-028](./ADR-028-demo-access-boundary.md) (Demo Access Boundary for Private Data and Public Uploads).

## Date

2026-06-18

## Context

ADR-028 established a deploy-time access boundary for an externally hosted Streamlit demo: a `FALL_DEMO_MODE` environment variable selected between a fail-safe `public` mode (internal nursing-home sources hidden, only the current session's uploads visible, no camera) and an explicit `operator` mode (all `ml/data/{domain}` sources plus the laptop camera). The boundary existed because the demo was expected to become externally reachable (ADR-021 attempted CPU-only HF Space / Streamlit Community Cloud hosting before deferring it).

We are no longer pursuing an externally hosted Streamlit demo. The demo (`ml/demo/`) is exclusively a local developer/operator tool run on a trusted machine (`pnpm dev:demo`), consistent with ADR-024 (the demo is not the product surface) and ADR-021's local-first posture. With no external surface, the `public`/`operator` branching protects nothing: it only added a fail-safe default that forced every local run to set `FALL_DEMO_MODE=operator`, and a public-mode code path that can never be exercised.

## Decision

The Streamlit demo is **local-only**. The `FALL_DEMO_MODE` public/operator access-mode branching is **removed**.

- There is no `public` mode and no `operator` mode. The demo always lists every internal `ml/data/{domain}/{raw,processed}` source plus session uploads, and always offers the laptop camera as a live source.
- `FALL_DEMO_MODE` is no longer read by any code. The standard run command is `pnpm dev:demo` with no mode variable.
- Private nursing-home footage stays on operator-controlled disks and out of Git. That custody guarantee is owned by [ADR-018](../ml/ADR-018-cross-machine-dataset-custody.md) and the gitignore perimeter — it does not depend on a demo runtime mode.
- The demo remains a non-product observation tool ([ADR-024](./ADR-024-ml-demo-product-surface-boundary.md)); product caregiver surfaces stay in `front/`/`backend/`.

If an externally reachable demo is ever revived (e.g. a GPU-hosted Space per ADR-021), a new ADR must re-establish a data-access boundary appropriate to that surface. It must not be assumed to exist by default.

## Strict common gate

This ADR stays in `common/` because it supersedes a common decision and still settles obligations across more than one domain:

- `ml/` no longer carries a deploy-time access-mode mechanism in the demo; nursing-home data custody reverts to being governed solely by ML data-custody decisions.
- Backend/frontend deployment plans no longer need to reason about an uploads-only external demo surface; the only externally reachable product surface is `front/`/`backend/`.
- Any future hosted-demo plan inherits an explicit "no access boundary exists yet — write one" obligation rather than a silent fail-safe default.

## Alternatives Considered

### Keep the public/operator branching but always default to operator locally

Rejected. The branching's only purpose was external deployment safety. With deployment cancelled, retaining it keeps dead code (the public path is unreachable) and a footgun (a stray `FALL_DEMO_MODE=public` would hide all internal sources for no reason).

### Keep ADR-028 active and merely stop deploying

Rejected. An accepted, cross-domain ADR that the code no longer implements is worse than removing it: future readers would trust a boundary that does not exist. Superseding it explicitly keeps the decision corpus honest.

### Delete `model_bootstrap.ensure_fall_models()` and other deploy remnants

Rejected for this change. Per ADR-021, the weight bootstrap is harmless locally (a no-op when weights are present) and useful for any future host; it is retained. This ADR only removes the access-mode branching, not the deploy-friendly bootstrap.

## Consequences

**Positive:**

- One less environment variable and one less code path; the demo "just works" with `pnpm dev:demo`.
- No unreachable public-mode code or tests masquerading as a privacy control.
- Data-custody privacy is anchored where it belongs (ADR-018 + gitignore), not in a UI runtime mode.

**Negative / trade-offs:**

- The demo must never be exposed externally as-is: it lists patient-adjacent footage by design. Reviving a hosted demo requires a new access-boundary ADR first.
- ADR-028's fail-safe-by-default protection is gone, so the "no external surface" precondition must hold for the demo to stay safe.

## Source preservation

ADR-028 remains in the corpus as the historical access-boundary record with its status updated to superseded. ADR-012's original `FALL_DEMO_MODE` clause is preserved as historical context; its access-boundary clauses were already extracted to ADR-028 and are now superseded through this ADR.
