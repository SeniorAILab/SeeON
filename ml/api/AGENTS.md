# Serving Agent Rules

Own the FastAPI api: app factory, lifespan boot, the worker→api
`/api/v1/relay/*` gateway, backend Event API egress, gateway metadata, and a relay-heartbeat-derived `/status`. `ml-api` is the edge
node's single no-HMAC Event API backend gateway (ADR-067/029); it does not assemble live camera
loops and shares no in-memory state with `ml-worker`.

## Local Ownership

- `main.py`: `create_app`, `/api/v1` route registration, legacy direct-test shims.
- `lifespan.py`: thin-gateway boot and `app.state` assembly.
- `heartbeat_store.py`: api-owned per-camera relay-heartbeat liveness store backing `/status` (`online`/`stale`/`never_seen`).
- `routes/`: HTTP route modules.

## Imports

Allowed: `contracts`, `events.edge_ingest_client`, local `api`, and FastAPI/Pydantic.

Forbidden: `training`, `demo`, `worker`, and worker-owned runtime modules. There is no `runtime` package to import; `/status` derives from the api-owned heartbeat store, not worker state.

## Focused Tests

- `tests/test_serving_api.py`
- `tests/test_serving_health.py`
- `tests/test_serving_status.py`
- `tests/test_serving_models.py`
- `tests/test_serving_boundary_contract.py`
- `tests/test_api_ingest_relay.py`
- `tests/test_api_heartbeat_store.py`
- `tests/test_import_dependency_ladder.py`

## Gotchas

`lifespan.py` boots a thin gateway: config, backend Event API gateway (relay token, camera inventory, no-HMAC ingest client), the heartbeat store, and readiness. It does NOT assemble camera loops, domain detectors, an `EdgeRuntime`, or worker runtime/state. `/api/v1/relay/heartbeat` stamps local `received_at` after auth + camera binding and before backend egress so `/api/v1/status` reflects edge-local truth even when backend egress fails. Keep route modules thin; product routes stay under `/api/v1`, while `/health/live` and `/health/ready` remain unversioned.
