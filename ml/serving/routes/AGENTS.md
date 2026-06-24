# Serving Routes Agent Rules

Own FastAPI route modules only. Business logic stays in `serving.pipeline`, `serving.lifespan`, `runtime`, `events`, or lower layers.

## Local Ownership

- `health.py`: live, ready, and legacy health responses.
- `status.py`: runtime/status-store snapshot.
- `models.py`: registry and loaded-model metadata.
- `debug.py`: bounded debug prediction by window or source id.

## Imports

Allowed: `serving`, lower-layer read-only facades needed by a route, FastAPI, Pydantic.

Forbidden: `training`, `demo`, `worker`, direct camera opening, direct model training.

## Focused Tests

- `tests/test_serving_health.py`
- `tests/test_serving_status.py`
- `tests/test_serving_models.py`
- `tests/test_serving_debug_predict.py`
- `tests/test_serving_client_real_route.py`
- `tests/test_import_dependency_ladder.py`

## Gotchas

Route validation is part of the public API. Keep error status codes covered when changing `debug.py` request validation or exception mapping.
