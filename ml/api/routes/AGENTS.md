# Serving Routes Agent Rules

Own FastAPI route modules only. Business logic stays in `api.lifespan`, `events`, or explicit gateway helpers.

## Local Ownership

- `health.py`: live, ready, and legacy health responses.
- `status.py`: runtime/status-store snapshot.
- `models.py`: gateway metadata; no model registry or loaded-model state.

## Imports

Allowed: `api`, lower-layer read-only facades needed by a route, FastAPI, Pydantic.

Forbidden: `training`, `demo`, `worker`, direct camera opening, direct model training.

## Focused Tests

- `tests/test_serving_health.py`
- `tests/test_serving_status.py`
- `tests/test_serving_models.py`
- `tests/test_import_dependency_ladder.py`

## Gotchas

Route validation is part of the public API. Keep error status codes covered when changing relay/status/models request validation or exception mapping.
