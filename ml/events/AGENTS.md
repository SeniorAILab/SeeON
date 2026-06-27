# Events Agent Rules

Own L4 outbound alert/event shape, publishers, outbox, and backend Event API client.

## Local Ownership

- `schemas.py`: emitted event and backend Event API payload construction.
- `local_publisher.py`: network-free publisher protocol and logging/stub implementation.
- `publisher.py`: demo Event API HTTP shim; do not import this from api.
- `outbox.py`: publisher-backed outbox.
- `edge_ingest_client.py`: no-HMAC backend Event API alert and heartbeat HTTP client using the single `API_BACKEND_EVENTS_URL` base.

## Imports

Allowed: `contracts` and local `events`.

Forbidden: `sources`, `runners`, `perception`, `domains`, `runtime`, `api`, `demo`, `training`.

## Focused Tests

- `tests/test_events_schema.py`
- `tests/test_events_outbox.py`
- `tests/test_events_ingest_client.py`
- `tests/test_alert_client.py`
- `tests/test_import_dependency_ladder.py`

## Gotchas

The backend egress contract is the no-HMAC Event API: post events to the single configured `API_BACKEND_EVENTS_URL` and heartbeats to `API_BACKEND_EVENTS_URL + "/heartbeat"` with JSON bodies only.
