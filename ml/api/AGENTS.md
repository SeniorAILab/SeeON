# Serving Agent Rules

Own the L5 FastAPI api: app factory, lifespan boot, the bounded debug prediction
pipeline, model facade, source registry facade (debug only), the worker→api
relay gateway, and a relay-heartbeat-derived `/status`. `ml-api` is the edge
node's single backend gateway (ADR-067/029); it does not assemble live camera
loops and shares no in-memory state with `ml-worker`.

## Local Ownership

- `main.py`: `create_app`, route registration, legacy direct-test shims.
- `lifespan.py`: thin-gateway boot and `app.state` assembly.
- `model.py`: api facade for the fall model runner.
- `pipeline.py`: source/window prediction pipeline (ADR-048 debug seam).
- `source_registry.py`: api import facade for `sources.registry` (bounded debug).
- `heartbeat_store.py`: api-owned per-camera relay-heartbeat liveness store backing `/status` (`online`/`stale`/`never_seen`).
- `routes/`: HTTP route modules.

## Imports

Allowed: production packages from lower layers, local `api`, and FastAPI/Pydantic.

Forbidden: `training`, `demo`, `worker`, and worker-owned runtime modules. There is no `runtime` package to import; `/status` derives from the api-owned heartbeat store, not worker state.

## Focused Tests

- `tests/test_serving_api.py`
- `tests/test_serving_health.py`
- `tests/test_serving_status.py`
- `tests/test_serving_models.py`
- `tests/test_serving_debug_predict.py`
- `tests/test_serving_boundary_contract.py`
- `tests/test_api_ingest_relay.py`
- `tests/test_api_heartbeat_store.py`
- `tests/test_import_dependency_ladder.py`

## Gotchas

`lifespan.py` boots a thin gateway: config, device/model/warmup, debug pipeline, backend-ingest gateway (relay token, camera inventory, ingest client), the heartbeat store, source registry (bounded debug), and readiness. It does NOT assemble camera loops, domain detectors, an `EdgeRuntime`, or worker runtime/state. `/relay/heartbeat` stamps local `received_at` after auth + camera binding and before backend egress so `/status` reflects edge-local truth even when backend egress fails. Keep route modules thin.
