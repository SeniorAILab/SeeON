# Demo Agent Rules

Own the Streamlit developer demo harness: playback UI, overlays, live-camera page wiring, labels, demo registries, and serving-backed classifiers.

## Local Ownership

- `app.py`: main Streamlit entrypoint.
- `demo_ui.py`, `ui_labels.py`, `thresholds.py`: controls, labels, thresholds.
- `live_view.py`, `render.py`, `yolo_overlay.py`, `playback_status.py`, `video_playback.py`: playback and overlay rendering.
- `classifiers.py`, `temporal_module.py`, `model_modules.py`, `model_bootstrap.py`: demo model adapters.
- `video_registry.py`, `app_assets.py`, `live_bench.py`: demo assets and benchmarking.
- `pages/`: Streamlit multipage entrypoints.

## Imports

Allowed: lower-layer production packages, `serving.client`, selected `training` metadata/catalog modules for demo-only temporal models, and local `demo`.

Forbidden: adding new production dependencies on `demo`, direct backend writes from UI code, secrets in app state.

## Focused Tests

- `tests/test_demo_app_controls.py`
- `tests/test_demo_serving_only_classification.py`
- `tests/test_demo_temporal_classifier.py`
- `tests/test_demo_yolo_overlay.py`
- `tests/test_demo_live_source_selection.py`
- `tests/test_import_dependency_ladder.py`

## Gotchas

Demo is L5 and can depend broadly, but production packages must not import it. Keep fall classification serving-backed unless a test explicitly covers demo-only temporal model behavior.
