---
slug: api-contract-dto-mapper-consolidation
status: done
date: 2026-06-23
author: codex
kind: plan
source: .omo/plans/api-contract-dto-mapper-consolidation.md
---

# Plan: API Contract, DTO Naming, and Frontend Mapper Consolidation

## Execution Order

1. Capture failing-first evidence for the current `/predict` backend adapter expectation, current DTO guard gaps, and current frontend unchecked mapper behavior.
2. Align `MlServingPredictionAdapter` and tests to `/debug/predict/window`.
3. Add a backend guard that makes DTO suffix and controller boundary violations fail after migration.
4. Migrate backend controller boundary DTO names and parse/presenter seams needed for the guard.
5. Add a frontend endpoint API layer and move backend-facing auth/session mapping into it first, then consolidate remaining backend-facing call surfaces without removing mock behavior.
6. Update docs/rules and API notes as links to the owning contract, not duplicate decision bodies.
7. Audit `docs/` for MECE ownership, duplicate contract text, and stale DTO/API references.

## Verification

- Backend: `pnpm --filter backend test -- ml-serving-prediction.adapter.spec.ts`, `pnpm --filter backend run lint:check`, `pnpm --filter backend exec tsc --noEmit`, `pnpm --filter backend test`.
- ML: `uv run --directory ml pytest ml/tests/test_serving_client_real_route.py ml/tests/test_serving_debug_predict.py`.
- Frontend: `pnpm --filter front test`, `pnpm --filter front exec tsc -b`, `pnpm --filter front lint`.
- Scope: grep/diff checks for `/predict`, DTO suffixes, endpoint mapper ownership, and absence of golden fixture implementation files.
- Documents: stale-reference scans and focused review of the owning `docs/rules/`, `docs/api/`, and `docs/decisions/` entries.

## Scope Notes

This plan is a focused implementation wrapper for the approved `.omo` plan. Existing active REST/API convention plans remain the architectural background; this work should update or cross-reference those rules rather than duplicate their decisions.
