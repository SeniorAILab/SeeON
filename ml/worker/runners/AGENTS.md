# Runners Agent Rules

Own worker model runner adapters, model registry wiring, device selection, and warmup.

## Local Ownership

- `registry.py`: task name to runner factory mapping.
- `sklearn_fall.py`: trained fall model artifact loader and predictor.
- `yolo_pose.py`, `yolo_bed_seg.py`: YOLO runner adapters.
- `device.py`, `warmup.py`: runtime device choice and model warmup.

## Imports

Allowed: `contracts`, local `worker/runners`, numerical/model libraries, and standard library.

Forbidden: `worker/sources`, `worker/perception`, `worker/domains`, `worker` orchestration, `events`, `api`, `demo`, `training`.

## Focused Tests

- `tests/test_runners_registry.py`
- `tests/test_serving_model.py`
- `tests/test_demo_bed_detector.py`
- `tests/test_import_dependency_ladder.py`

## Gotchas

Runner swaps should stay behind `ModelRegistry`. Do not make callers import concrete runner classes unless a test or adapter needs explicit construction.
