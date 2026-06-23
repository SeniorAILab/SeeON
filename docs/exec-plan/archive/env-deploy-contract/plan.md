---
slug: env-deploy-contract
status: done
---

# Env Deploy Contract

## Objective

Separate local and production environment handling for the monorepo while keeping the contract easy to find from one place.

## Decision

- Tracked environment contract examples live at the repo root.
- Real local development values live in gitignored `.env.local` and are copied from `.env.local.example`.
- Real production values live in gitignored root env files, for example `.env.host.prod` and `.env.edge.prod`.
- Host production and edge production use separate actual env bundles because they run on different machines/trust boundaries.
- Frontend production builds use same-origin `/api`, `VITE_USE_MOCK=false`, and no secrets.

Detailed planning record: `.omo/plans/env-deploy-contract.md`.

## Implementation

1. Add `.env.local.example`, `.env.host.prod.example`, and `.env.edge.prod.example`.
2. Add an env contract verifier that renders production Compose config and rejects dev placeholders/defaults.
3. Harden the host production Compose overlay and frontend Docker build args.
4. Add backend production env validation.
5. Update local and deploy docs.
6. Verify with `pnpm env:verify`, backend env tests, frontend/backend typechecks, frontend build, and rendered Compose config evidence.

## Success Criteria

- Production Compose cannot silently inherit `fall_dev`, `fall_app:fall_app`, localhost production origins, fixed token encryption key, or mock frontend mode.
- Local development still uses one ignored `.env.local`.
- Edge ML deploy env remains explicit and fail-closed.
- Verification is executable without real secrets.
