# Contracts Agent Rules

Own L0 ML contract types: frames, observations, model protocols, artifact path helpers, and event enums.

## Local Ownership

- `frame.py`: `Frame` and `FrameSource`.
- `observation.py`: boxes, labels, detection results, and `FrameObservation`.
- `model.py`: model module protocol and shared confidence defaults.
- `artifacts.py`: model/weight path helpers.
- `event.py`: event severity, levels, and frontend event-type mapping.

## Imports

Allowed: standard library and local `contracts` modules.

Forbidden: `features`, `sources`, `runners`, `perception`, `domains`, `runtime`, `events`, `serving`, `demo`, `training`, model loading, camera I/O, network I/O.

## Focused Tests

- `tests/test_contract.py`
- `tests/test_frame_observation_contract.py`
- `tests/test_events_schema.py`
- `tests/test_import_dependency_ladder.py`

## Gotchas

Contracts are consumed across every layer. Prefer additive fields or new dataclasses over changing existing constructor semantics.
