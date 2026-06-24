# Demo Pages Agent Rules

Own Streamlit page entrypoints only. Shared controls, rendering, registries, and classifiers stay one level up in `demo`.

## Local Ownership

- `live_camera.py`: live-camera page wiring for UI controls, `CameraSource`, and live-frame iteration.

## Imports

Allowed: `demo`, `sources`, and Streamlit page dependencies.

Forbidden: `training`, `serving` route internals, `runtime`, `events`, backend clients, model training.

## Focused Tests

- `tests/test_demo_live_source_selection.py`
- `tests/test_live_view.py`
- `tests/test_import_dependency_ladder.py`

## Gotchas

Pages may adjust `sys.path` for Streamlit execution. Keep that confined to entrypoints; do not copy page bootstrap code into shared demo modules.
