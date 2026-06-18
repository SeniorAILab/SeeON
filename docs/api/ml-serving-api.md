# ML Serving API

ML serving is a FastAPI service. Its boundary is classification only: ML receives a normalized pose window and returns fall probability/classification. Backend owns alert policy, persistence, deduplication, delivery, and dashboard history (ADR-023).

## `GET /health`

Returns service and artifact health.

Current fields include:

```json
{
  "status": "ok",
  "model": { "model_type": "random-forest", "framework": "sklearn", "window": 30, "stride": 5, "feature_dim": 45, "name": "...", "version": "...", "operating_threshold": 0.09, "source": "trained" },
  "metadata": { },
  "model_type": "random-forest",
  "model_status": "ok",
  "model_error": null,
  "pose": { "size": "n", "weight_available": true },
  "artifacts": { "random_forest_available": true }
}
```

When the artifact cannot load, `status` is `degraded`, `model_status` is `error`, and `model_error` carries the explicit load error. Health does not fake model availability.

## `POST /predict` — R1-A window contract

Current-effective backend serving contract. `POST /predict` accepts `{ "window": ... }` and returns the response fields below.

### Request

```json
{
  "window": [[0.12, 0.34, 0.99, 0.13, 0.35, 0.98]]
}
```

`window` is `number[][]` with shape `[T][51]`:

- `T` is the number of frames. Operating window is approximately 30 frames; serving constants require `EXPECTED_WINDOW = 30`.
- Each row contains 17 COCO-17 keypoints × `[x, y, conf]` = 51 numbers.
- Coordinates are normalized the same way as training via `normalize_person_keypoints`.
- `conf` values are in `[0, 1]`.
- No raw images or video are sent across the backend↔ML contract.

### Pipeline

The confirmed R1-A path is:

1. Validate `window` as `[T][51]` numeric data.
2. Reshape `[T][51]` to `[T][17][3]`.
3. Call `ml/training/data/features.extract_window_features` through `ml/serving/pipeline.window_to_features`.
4. Produce the 45-dimensional feature vector required by `EXPECTED_FEATURE_DIM = 45`.
5. Call `FallDetector.predict`, which uses the loaded random forest model's `predict_proba`.
6. Read `operating_threshold` from model metadata or fall back to `DEFAULT_OPERATING_THRESHOLD = 0.09`.
7. Return `is_fall = fall_probability >= operating_threshold`.

### Response

Response is a superset; the backend adapter requires these three fields and ignores extras:

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

## Retained demo/eval mode

The existing source-backed mode is retained for demo/evaluation, separate from the backend alert contract:

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

or:

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

That path resolves a bounded server-side `FrameSource`, runs YOLO pose extraction, normalizes the primary person, builds a pose window, and calls the same random forest. It is for demo/eval surfaces, not the backend alert-ingest boundary.

This implementation may keep demo/eval mode in the same `/predict` endpoint as a discriminated branch or split it behind a demo-only route. In either shape, the backend contract remains `{ window }` → `{ fall_probability, operating_threshold, is_fall }`.
