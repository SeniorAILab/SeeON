# Serving Agent Rules

Own the FastAPI api: app factory, lifespan boot, the worker→api
`/api/v1/relay/*` gateway, backend Event API egress, gateway metadata, and a relay-heartbeat-derived `/status`. `ml-api` is the edge
node's single no-HMAC Event API backend gateway (ADR); it does not assemble live camera
loops and shares no in-memory state with `ml-worker`.

## Local Ownership

- `main.py`: `create_app`, `/api/v1` route registration, legacy direct-test shims.
- `lifespan.py`: thin-gateway boot and `app.state` assembly.
- `heartbeat_store.py`: api-owned per-camera relay-heartbeat liveness store backing `/status` (`online`/`stale`/`never_seen`).
- `routes/`: HTTP route modules.

## Imports

Allowed: `contracts`, `events.edge_ingest_client`, local `api`, and FastAPI/Pydantic.

Forbidden: `training`, `demo`, `worker`, and worker-owned runtime modules. There is no `runtime` package to import; `/status` derives from the api-owned heartbeat store, not worker state.

## FastAPI / wire-schema convention

- HTTP wire schemas are Pydantic `BaseModel` (never `dataclass`) and live in the `api` layer — the route module, or a shared `api/schemas.py` once reused. Never put wire schemas in `contracts`; L0 stays framework-free.
- Naming: request = `<Action>Request`, response = `<Action>Response` (`RelayAlertRequest`, `PredictRequest`/`PredictResponse`); a trivial ack may return a typed `dict[str, str]`.
- Strictness: request models set `model_config = ConfigDict(extra="forbid")` and validate every field with `Field(...)` (`ge`/`le`/`min_length`); routes declare `response_model=<Action>Response`.
- Settings: `pydantic_settings.BaseSettings` + `SettingsConfigDict(env_prefix="ML_API_", extra="ignore")`.
- Routers: one `APIRouter(prefix=..., tags=[...])` per module with thin handlers; product routes under `/api/v1`, health probes unversioned; end the module with `__all__ = ["router"]`.
- Injected collaborators (backend clients, stores) are `typing.Protocol` bound in `lifespan.py`, not concrete imports in route handlers.

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
