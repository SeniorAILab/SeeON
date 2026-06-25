# ADR-066: Backend DTO contract hard gate

## Status

Accepted

## Date

2026-06-23

## Context

ADR-046 defines backend DTOs as the HTTP and external-service boundary shape. ADR-064 made inline DTO placement visible through warn-first ESLint, but DTO names and controller body boundaries still depended on review discipline. That was not enough for the API contract cleanup: backend request/response DTOs must be mechanically fixed by convention, and controllers must not accept untyped or inline request bodies.

The repository now has three contract surfaces that need the same DTO shape:

- backend controllers and services use DTO names as the local boundary contract;
- frontend endpoint mappers parse backend JSON into frontend domain state;
- ML/backend event and prediction seams need stable request/response names as more events are added.

## Decision

Add a blocking DTO contract guard under the existing backend guard SSOT:

- `scripts/backend-guard/check-dto-contracts.mjs` owns the check logic.
- `pnpm --filter backend run dto:check` runs the guard.
- Exported backend `*Dto` names must end in one of the role suffixes documented in `docs/rules/dto-convention.md`.
- Controller `@Body()` parameters must use a named `*RequestDto`; inline object body types, `Record<string, unknown>`, and non-`RequestDto` body types are rejected.
- Backend CI runs `dto:check` as a blocking step.
- The local pre-push lint/type gate runs `dto:check` before backend typecheck.
- Negative fixtures live under `scripts/backend-guard/fixtures/invalid-dto-contracts/` and prove ambiguous `Create*Dto`/`Update*Dto`, inline `@Body()` object types, and untyped request bodies are rejected.

This supersedes only ADR-064's prior assumption that DTO contract enforcement would remain warn-first. ADR-064 still owns layering lint, inline DTO placement warnings, typed-rule rollout, and the schema↔migration guard.

## Alternatives Considered

### Keep DTO naming as documentation plus review

- Pros: no new guard logic.
- Cons: does not satisfy the requirement that every backend boundary DTO be forced; future ML/backend event work can drift silently.
- Rejected: the DTO contract is a boundary invariant, not a stylistic preference.

### Use class-validator/class-transformer DTO classes now

- Pros: richer runtime validation and OpenAPI-style metadata later.
- Cons: adds dependencies and a migration pattern beyond the current cleanup scope.
- Rejected for now: the current guard fixes naming and controller boundary shape without adding dependencies. Runtime validation can be decided separately.

### Put the DTO check in ESLint

- Pros: one tool for all TypeScript conventions.
- Cons: cross-file exported-name and fixture-mode behavior is simpler and more explicit as a small repository guard; current ESLint rollout is intentionally warn-first.
- Rejected: `dto:check` is clearer as a blocking contract guard under `scripts/backend-guard/`.

## Consequences

- DTO suffix and controller body-boundary drift blocks CI and local pre-push when backend or backend guard files change.
- `docs/rules/dto-convention.md` is the naming/mapper SSOT; `docs/rules/backend-architecture-lint-and-guard.md` records where the guard runs.
- Frontend endpoint mappers and backend DTO names now have a stable convention to align against.
- Priority 4 ML/backend golden fixtures remain deferred; this ADR only fixes the naming and controller boundary gate.
