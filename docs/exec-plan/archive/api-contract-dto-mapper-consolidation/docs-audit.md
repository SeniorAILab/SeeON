# Docs audit: API contract DTO mapper consolidation

## Scope

This audit checks the documentation surface touched by the API contract cleanup:

- `docs/rules/dto-convention.md` owns DTO suffixes, backend/frontend mapper boundaries, and JSON naming rules.
- `docs/rules/backend-architecture-lint-and-guard.md` owns enforcement wiring and links to the DTO convention instead of repeating it.
- `docs/api/ml-serving-api.md` and ADR-048 own the canonical ML route: `POST /debug/predict/window`.
- ADR-066 owns the hard DTO contract gate.

## Result

- Removed the generated binary brief from `docs/exec-plan/archive/api-contract-dto-mapper-consolidation/`; canonical docs stay markdown.
- Replaced file-artifact-oriented plan/spec wording with a `docs/` MECE audit requirement.
- Split the DTO hard-gate decision into ADR-066 so ADR-064 remains focused on warn-first layering/inline-DTO placement and schema↔migration enforcement.
- Wired `dto:check` into backend CI and the local backend pre-push gate so the documented hard gate is real.
- Stale pre-convention DTO names are removed from canonical docs.

## Deferred Lifecycle Cleanup

Some older `docs/exec-plan/active/*` work plans still contain historical `/predict` wording. They are not edited in this slice because finalized plan bodies are lifecycle-managed artifacts. Current authority remains `docs/api/ml-serving-api.md`, ADR-048, and ADR-066.
