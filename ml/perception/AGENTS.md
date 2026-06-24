# Perception Agent Rules

Own L2 observation construction and scene state derived from frames and runner outputs.

## Local Ownership

- `observation_builder.py`: converts raw detections, poses, and bed boxes into `FrameObservation`.
- `tracker.py`: greedy IoU tracking.
- `window_buffer.py`: temporal frame windows.
- `scene_state.py`: scene-level state.
- `bed_detector.py`: bed detection post-processing for overlays and domains.

## Imports

Allowed: `contracts`, `features`, and local `perception`.

Forbidden: `sources`, `runners`, `domains`, `runtime`, `events`, `serving`, `demo`, `training`.

## Focused Tests

- `tests/test_perception_observation_builder.py`
- `tests/test_frame_observation_contract.py`
- `tests/test_demo_tracking.py`
- `tests/test_demo_bed_detector.py`
- `tests/test_import_dependency_ladder.py`

## Gotchas

Perception builds facts about a frame; it does not decide whether an alert should fire. Put domain-specific latches under `domains`.
