# Real bed-exit local firing runbook

This is a host-native operator runbook for the empirical two-browser firing demo. The real-mode wiring is necessary but not sufficient: backend ingest, ML relay, worker domain wiring, camera inventory, and dashboard SSE are already code-wired, but live firing still depends on an external RTSP source, real model behavior, and wall-clock night-window timing.

Live firing is empirical. It requires a worker-reachable external camera or `SeniorAILab/rtsp-generator`; this repository must not start MediaMTX, FFmpeg, or any file-to-RTSP publisher.

## Boot order

1. Start the database.
   ```bash
   pnpm db:up
   ```
2. Seed and start the backend on `:8080`.
   ```bash
   pnpm prisma:seed
   pnpm dev:backend
   ```
3. Start `ml-api` on `:8000` with the 201 camera inventory and backend Event API URL.
   ```bash
   API_BACKEND_EVENTS_URL=http://localhost:8080/api/v1/events \
   API_CAMERA_INVENTORY='[{"camera_id":"cam_sp_201","facility_id":"fac_happy_nokyang","resident_id":"res_kim"}]' \
   pnpm dev:ml-api
   ```
4. Start the external RTSP source outside this repository, using the 401 clip:
   `ml/data/nursing-home/processed/2026-02-11 베스트요양원1 401호.mp4`.
   Pass the resulting worker-reachable `rtsp://...` URL through `NURSING_HOME_RTSP_URL` or `BED_EXIT_RTSP_URL`.
5. Start the host-native real worker with dev MJPEG enabled.
   ```bash
   NURSING_HOME_RTSP_URL=rtsp://... \
   ML_WORKER_DEV_MJPEG=1 \
   scripts/ml-worker-real-bedexit-local-e2e.sh worker
   ```
   The helper generates a local worker YAML for `cam_sp_201` / `fac_happy_nokyang`, enables the `bed_exit` domain, uses the real `DEFAULT_REGISTRY`, uses `OPENCV_FFMPEG_CAPTURE_OPTIONS=rtsp_transport;tcp`, and keeps the wall-clock night window at `21:00-05:00 Asia/Seoul`. It does not set `BED_EXIT_NOW` and does not use scripted runners.
6. Start the frontend.
   ```bash
   pnpm dev:front
   ```
   Keep `VITE_USE_MOCK` unset or false. Do not set `VITE_USE_MOCK=true`.

## Two-browser verification

- Left browser: `http://127.0.0.1:8090/stream/cam_sp_201` (or the configured `ML_WORKER_DEV_MJPEG_PORT`).
- Right browser: product dashboard logged in as `director@happy-nokyang.local` / `1234`.
- Expected live result: a `201호` bed-exit alert appears in the dashboard, delivered by backend SSE `GET /api/v1/dashboard/stream`.

## Troubleshooting

- Missing weights: restore `ml/models/pose/yolo26n-pose.pt`, `ml/models/person/yolo26n.pt`, and `ml/models/bed/yolo26m-seg.pt` before starting the worker.
- RTSP unreachable: confirm the external `rtsp://...` endpoint is reachable from the host running `ml-worker`; use TCP transport (`OPENCV_FFMPEG_CAPTURE_OPTIONS=rtsp_transport;tcp`).
- Camera inventory mismatch: `API_CAMERA_INVENTORY` must include `cam_sp_201`, `fac_happy_nokyang`, and the resident id used by the worker config.
- Night-window wall clock: the real worker only fires bed-exit during `21:00-05:00 Asia/Seoul`; no fake `BED_EXIT_NOW` override is used by the helper.
- Frontend mock mode: `VITE_USE_MOCK=true` hides the real dashboard stream. Keep it unset or false.
- Realtime route mismatch: `/api/v1/sse` is absent; use `/api/v1/dashboard/stream` through the product dashboard.
- Fallback clips: if the 401 clip does not produce usable live evidence, try `베스트요양원2 203호`, then `베스트요양원2 502호` through the same external RTSP generator.
