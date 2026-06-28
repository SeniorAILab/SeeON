# Sources Agent Rules

Own worker frame intake: video files, webcams, RTSP, source probing, and worker source resolution.

## Local Ownership

- `frame_source.py`: compatibility exports for `FrameSource` implementations.
- `video_file.py`, `webcam.py`, `rtsp.py`, `rtsp_backend.py`: concrete frame sources.
- `camera_probe.py`: local camera discovery.
- `registry.py`: worker source registry for configured sources.

## Imports

Allowed: `contracts`, local `worker/sources`, OpenCV, and standard library helpers.

Forbidden: `worker/runners`, `worker/perception`, `worker/domains`, `worker` orchestration, `events`, `api`, `demo`, `training`.

## Focused Tests

- `tests/test_sources_frame_source.py`
- `tests/test_sources_camera.py`
- `tests/test_sources_camera_probe.py`
- `tests/test_sources_rtsp.py`
- `tests/test_sources_no_demo_dependency.py`
- `tests/test_import_dependency_ladder.py`

## Gotchas

`SourceRegistry` rejects raw paths, traversal, numeric device indexes, and untrusted live descriptors. Keep raw live descriptors out of public/API-facing surfaces.
