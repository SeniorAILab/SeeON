# Bed-Exit Domain Agent Rules

Own bed-exit event detection, bed occupancy schema, and per-person exit latching.

## Local Ownership

- `detector.py`: sticky own-bed assignment and exit event generation.
- `latch.py`: onset-only bed-exit latch.
- `schema.py`: bed status, frame, and event dataclasses.

## Imports

Allowed: `contracts`, `features` through `perception.tracker`, and local `domains.bed_exit`.

Forbidden: `sources`, `runners`, `runtime`, `events`, `serving`, `demo`, `training`.

## Focused Tests

- `tests/test_domains_bed_exit.py`
- `tests/test_demo_bed_exit.py`
- `tests/test_import_dependency_ladder.py`

## Gotchas

The detector uses person-box containment against bed boxes. Keep `hold_frames`, `grace_frames`, and `min_containment` behavior covered when changing assignment logic.
