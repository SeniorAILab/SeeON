# ML Serving API

ML API is a FastAPI service for private/local edge health, status, model, debug, and bounded control surfaces. Its prediction boundary is classification only: ML receives a normalized pose window and returns fall probability/classification. Backend owns alert policy, persistence, deduplication, delivery, and dashboard history (ADR-023). Edge deployment keeps pose extraction and classification on the edge node while preserving backend ownership of alert policy and delivery (ADR-048).

Production live path: `RTSP -> ml-worker -> ml-api -> backend /ingest/*` (ADR-067/029).

Production camera ownership is not part of the API process. The edge node runs
`ml-api` for health/status/debug routes. It runs `ml-worker` for
long-running RTSP capture, model/domain evaluation, heartbeat facts, and alert fact
creation (ADR-067/ADR-068). The API service does not own live camera streams or
raw frame relay; it is the local relay and backend gateway for signed `/ingest/*` side
effects.

Bare `POST /predict` is removed and returns 404. Callers must use the explicit debug prediction routes below.

## `GET /health/live`

Liveness probe. Returns `200` with:

```json
{ "status": "ok" }
```

## `GET /health/ready`

Readiness probe. Returns the API service readiness snapshot from app state. When the service is still booting or unavailable, the same body is returned with HTTP `503`; ready services return HTTP `200`. Camera stream health is reported by the worker path and does not block API liveness.

## `GET /health`

Legacy aggregate health report for local/demo observability. It reports service status, loaded model metadata, model load errors, pose-weight availability, and random-forest artifact availability. Health does not fake model availability: artifact/model failures produce `status: "degraded"`, `model_status: "error"`, and a concrete `model_error`.

## `GET /status`

Runtime status snapshot. This is operational state for the edge API process, not an alert-history API. Backend remains the owner of persisted alert/dashboard state. Production camera workers run out-of-process and relay heartbeat/alert facts to `ml-api`, which publishes backend ingest per ADR-067/029.

## `GET /models`

Model registry snapshot. Returns registered task names, loaded model metadata when a model is attached to the app, and the api device descriptor.

Example shape:

```json
{
  "registry": { "tasks": ["fall-detection"] },
  "loaded_model": { "name": "fall-rf", "version": "2026-06-18" },
  "device": "cpu"
}
```

## `POST /debug/predict/window` — canonical window contract

Current-effective classification contract. `POST /debug/predict/window` accepts a normalized pose window and returns fall probability, operating threshold, and boolean classification. This is the route used by the edge/demo classifier client; no raw images or video are sent across this boundary.

### Request

```json
{
  "window": [[0.12, 0.34, 0.99, 0.13, 0.35, 0.98]]
}
```

`window` is `number[][]` with shape `[T][51]`:

- `T` is the number of frames. Operating window is approximately 30 frames; api constants require `EXPECTED_WINDOW = 30`.
- Each row contains 17 COCO-17 keypoints × `[x, y, conf]` = 51 numbers.
- Coordinates are normalized the same way as training via `normalize_person_keypoints`.
- `conf` values are finite numbers in `[0, 1]`.
- The request must include `window` and must not include `source_id` or `upload_id`.

### Pipeline

The confirmed window path is:

1. Validate `window` as `[T][51]` numeric data.
2. Reshape `[T][51]` to `[T][17][3]`.
3. Call `training.data.features.extract_window_features` through `api.pipeline.window_to_features`.
4. Produce the 45-dimensional feature vector required by `EXPECTED_FEATURE_DIM = 45`.
5. Call `FallDetector.predict`, which uses the loaded random forest model's `predict_proba`.
6. Read `operating_threshold` from model metadata or fall back to `DEFAULT_OPERATING_THRESHOLD = 0.09`.
7. Return `is_fall = fall_probability >= operating_threshold`.

### Response

The response is:

```json
{
  "model": "fall-rf",
  "version": "2026-06-18",
  "fall_probability": 0.97,
  "operating_threshold": 0.09,
  "is_fall": true
}
```

Field rules:

- `fall_probability`: number in `[0, 1]`.
- `operating_threshold`: number in `[0, 1]`.
- `is_fall`: boolean computed from probability and threshold.
- `model` and `version`: model metadata for observability.

## `POST /debug/predict/source` — bounded source/upload debug mode

Source-backed prediction is retained for local demo/evaluation only, separate from the production RTSP and backend alert-ingest boundary. It accepts exactly one trusted `source_id` or `upload_id` plus optional bounded controls:

```json
{
  "source_id": "trusted-live-source",
  "start_sec": 0,
  "duration_sec": 5,
  "frame_stride": 1,
  "max_frames": 120,
  "timeout_sec": 10
}
```

Or:

```json
{
  "upload_id": "uploaded-video",
  "start_sec": 0,
  "duration_sec": 5,
  "frame_stride": 1,
  "max_frames": 120,
  "timeout_sec": 10
}
```

This route resolves a bounded server-side `FrameSource`, runs YOLO pose extraction, normalizes the primary person, builds a pose window, and calls the same random forest. It returns the same response shape as `/debug/predict/window`. It is for demo/eval surfaces, not production RTSP, not raw frame relay, and not the backend alert-ingest boundary. It rejects requests that include `window`.
