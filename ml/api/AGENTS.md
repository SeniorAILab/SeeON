# Serving Agent Rules

Own L5 FastAPI api: app factory, lifespan boot, prediction pipeline, model facade, source registry facade, and route registration.

## Local Ownership

- `main.py`: `create_app`, route registration, legacy direct-test shims.
- `lifespan.py`: boot order and `app.state` assembly.
- `model.py`: api facade for the fall model runner.
- `pipeline.py`: source/window prediction pipeline.
- `source_registry.py`: api import facade for `sources.registry`.
- `routes/`: HTTP route modules.

## Imports

Allowed: production packages from lower layers, local `api`, and FastAPI/Pydantic.

Forbidden: `training`, `demo`, `worker`.

## Focused Tests

- `tests/test_serving_api.py`
- `tests/test_serving_health.py`
- `tests/test_serving_status.py`
- `tests/test_serving_models.py`
- `tests/test_serving_debug_predict.py`
- `tests/test_serving_boundary_contract.py`
- `tests/test_import_dependency_ladder.py`

## Gotchas

`lifespan.py` owns boot order: config, device/model/warmup, pipeline, incident/outbox, source registry, domain detectors, runtime, readiness. Keep route modules thin.
