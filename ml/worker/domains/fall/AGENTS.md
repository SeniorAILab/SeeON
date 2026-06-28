# Fall Domain Agent Rules

Own fall-event latching and fall event schema.

## Local Ownership

- `detector.py`: `FallEventLatch`, rising-edge detection, and observation-to-event dict conversion.
- `schema.py`: `FallEvent` dataclass.

## Imports

Allowed: `contracts` and local `domains.fall`.

Forbidden: `perception`, `runtime`, `events`, `api`, `demo`, `training`, model runners, sources.

## Focused Tests

- `tests/test_domains_fall.py`
- `tests/test_import_dependency_ladder.py`

## Gotchas

`FallEventLatch.update` is the worker-facing `FrameObservation` -> event-payload API. Use `update_signal` for low-level boolean rising-edge tests and demo status latching.
