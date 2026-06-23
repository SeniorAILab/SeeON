---
slug: api-contract-dto-mapper-consolidation
status: done
date: 2026-06-23
author: codex
kind: spec
source: .omo/plans/api-contract-dto-mapper-consolidation.md
---

# Spec: API Contract, DTO Naming, and Frontend Mapper Consolidation

## Goal

Implement the approved API contract cleanup without broadening scope:

- Align the backend-to-ML prediction call to ML serving's canonical `POST /debug/predict/window`.
- Keep backend public product routes under `/api/*`.
- Make backend request/response DTO naming and controller boundary DTO usage enforceable.
- Consolidate frontend backend-facing response mapping into endpoint-owned API modules.
- Audit `docs/` so the final contract documentation is MECE and non-duplicative.

## Non-Goals

- Do not implement ML-backend golden fixtures, shared cross-runtime samples, or parity checks.
- Do not add an ML `/predict` compatibility alias.
- Do not change Prisma schema, migrations, or database contracts.
- Do not rewrite unrelated frontend UI, domain models, or mock data.
- Do not add a validation dependency unless a later plan explicitly approves it.

## Success Criteria

- Backend ML adapter tests and ML serving route tests prove `/debug/predict/window` is the aligned contract.
- Backend lint or guard checks reject invalid DTO naming/placement and untyped controller boundaries after migration.
- Frontend tests prove endpoint mappers parse or reject backend response shapes instead of relying on scattered casts.
- Scope checks prove priority 4 remains deferred and no golden fixture implementation files were added.
- Final docs audit proves the implemented contract is recorded without duplicating existing ADR/rule ownership.
