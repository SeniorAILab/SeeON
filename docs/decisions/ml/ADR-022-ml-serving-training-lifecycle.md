# ADR-022: ML Serving and Training Lifecycle Boundary

## Status

Accepted. Owns the ML serving/training lifecycle and dependency-group boundary decision (ADR-015 owns the artifact-path formula); earlier combined-ADR history is recoverable from git.

## Date

2026-06-13

## Context

ADR-003 bundled several active decisions: the split between ML serving and training, the ML/backend product boundary, the Streamlit demo/product frontend distinction, and the original artifact layout. The artifact layout was later superseded by ADR-015. To make the active ADR set MECE, the remaining active ADR-003 clauses are split into atomic successors.

This ADR owns only the **ML-internal lifecycle boundary**: how the `ml/` uv project separates online serving from batch training while keeping dependency management coherent.

## Decision

`ml/` keeps two explicit lifecycles inside one uv project:

- `serving/` is the online FastAPI lifecycle. It boots quickly, exposes the prediction API, and should be deployable with serving-only dependencies.
- `training/` is the batch lifecycle. It owns dataset processing, pose extraction, temporal model training, evaluation, and trained artifact production.

Both lifecycles remain in one uv project rather than separate Python projects. They share project-level dependency resolution and code conventions, but runtime dependency weight is separated through uv dependency groups.

`pyproject.toml` keeps serving dependencies in the base dependency set and heavier demo/training dependencies in dependency groups. Developer installs may include all default groups; slim serving hosts use the explicit serving-only install path when needed.
The lifecycle boundary is enforced as an import boundary. `training/` may import only its training-local modules plus `contracts/`, `features/`, `sources/`, and `runners/`; it must not import `perception/`, `domains/`, `runtime/`, `events/`, `serving/`, `demo/`, `core/`, or `util/`. `serving/` must not import `training/`. These constraints are guarded by `ml/tests/test_import_dependency_ladder.py`.

## MECE boundary

| Concern | Owning ADR |
|---|---|
| ML serving/training lifecycle and uv dependency-group boundary | ADR-022 |
| ML output vs backend product policy/side effects | ADR-023 |
| Streamlit ML demo vs product `front/` UI | ADR-024 |
| Current `ml/models/` artifact/model layout | ADR-015 |

## Alternatives Considered

### One combined training and serving lifecycle

Rejected. Training has batch cadence, heavyweight dependencies, and long-running compute; serving is online and must stay lean. Combining them would force training dependencies and operational risk into the serving path.

### Separate Python projects for serving and training

Rejected for this repository stage. Separate uv projects would add duplicate configuration and cross-project coordination without clear benefit while the codebase is still PoC-scale. One uv project with explicit lifecycle folders and dependency groups is the smaller boundary.

### Node/Nest-owned model inference

Rejected by retired source ADR-003 and preserved here only as historical context. Python ML dependencies and TypeScript backend dependencies should not be fused into one runtime.

## Consequences

**Positive:**

- Future serving work has a clear target: keep the online API path thin and avoid importing training-only machinery.
- Training can evolve without forcing every serving host to carry its full dependency footprint.
- One uv lock continues to cover the ML project, avoiding multi-project drift.

**Negative / trade-offs:**

- A single uv project still means dependency-group discipline matters; careless imports can re-couple serving to training dependencies.
- Slim serving environments require an explicit install mode rather than being the default developer setup.

## Source mapping

This ADR is a distilled active successor. The original ADR-003 context, alternatives, and consequences are recoverable from git history; this ADR plus ADR-015, ADR-023, and ADR-024 carry the current active clauses so the visible corpus stays MECE.
