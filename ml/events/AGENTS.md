# Events Agent Rules

Own L4 outbound alert/event shape, HMAC signing, publishers, outbox, and backend ingest client.

## Local Ownership

- `schemas.py`: emitted event and alert payload construction.
- `signing.py`: canonical payload and HMAC helpers.
- `local_publisher.py`: network-free publisher protocol and logging/stub implementation.
- `publisher.py`: demo alert-client HTTP shim; do not import this from api.
- `outbox.py`: publisher-backed outbox.
- `edge_ingest_client.py`: backend alert and heartbeat HTTP client for edge worker.

## Imports

Allowed: `contracts` and local `events`.

Forbidden: `sources`, `runners`, `perception`, `domains`, `runtime`, `api`, `demo`, `training`.

## Focused Tests

- `tests/test_events_schema.py`
- `tests/test_events_signing.py`
- `tests/test_events_outbox.py`
- `tests/test_events_ingest_client.py`
- `tests/test_alert_client.py`
- `tests/test_import_dependency_ladder.py`

## Gotchas

Signing tests protect backend ingest compatibility. Keep timestamp, canonical payload, and key-derivation changes synchronized with backend ingest tests.
