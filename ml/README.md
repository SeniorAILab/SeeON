# ml

Python (uv) project. Owns **two lifecycles**:

- `training/` — **batch**: dataset → model artifact.
- `serving/` — **online API**: private/local FastAPI app exposing health, status, models, debug routes, and bounded control surfaces.
- `worker.edge_worker` — **online worker**: production RTSP camera ownership, model/domain evaluation, heartbeat, and backend ingest publishing.

Production live path: `RTSP -> ml-edge-worker -> backend /ingest/*`. `ml-edge-api`
does not own production RTSP, raw frame relay, or backend ingest side effects.

Plus `demo/` (Streamlit ML-demo UI), `tests/`, and `models/` artifact storage.

## Layout

```
ml/
  pyproject.toml          # uv project; serving deps + demo/training groups
  contracts/              # shared frame/model/artifact/observation contracts
  features/               # feature extraction and window transforms
  sources/                # camera/video/upload frame sources and registries
  runners/                # task/model runner registry wiring
  perception/             # pose detection and perception adapters
  domains/                # domain-specific policy/value objects
  runtime/                # edge runtime status and lifecycle state
  events/                 # edge event DTOs/emitters
  serving/                # FastAPI serving (/health/*, /status, /models, /debug/predict/*)
  worker/                 # ml-edge-worker CLI entrypoint
  training/               # batch training, evaluation, and artifact production
  demo/                   # Streamlit local demo UI
  tests/                  # pytest coverage for package boundaries and behavior
  models/                 # ADR-015 model artifacts (gitignored weights where applicable)
    pose/                 # YOLO pose weights resolved by contracts.artifacts.pose_weight_path()
    fall/                 # trained fall-classifier artifacts and metadata
  data/                   # local datasets/uploads (gitignored)
    raw/  processed/  uploads/
```

The artifact layout is path-addressed under `ml/models/` per ADR-015. Pose weights cache under `ml/models/pose/`; trained fall-classifier files live under the model-family directories used by the training catalog. Do not reintroduce retired model/version artifact trees.

## Commands (from repo root)

```bash
pnpm dev:ml      # FastAPI serving on :8000
pnpm dev:ml-worker --config config/edge-cameras.local.json
pnpm dev:demo    # Streamlit demo
```

Or directly:

```bash
uv sync                                      # install slim serving deps
uv sync --group demo --group training        # full serving: cv2 + ultralytics + sklearn/joblib for pose→RF inference
uv run --group demo --group training uvicorn serving.main:app --reload --port 8000
uv run python -m worker.edge_worker --config config/edge-cameras.local.json --heartbeat-on-start
uv run --group demo streamlit run demo/app.py
```

`serving.main:/debug/predict/window` is the canonical `[T][51]` pose-window classification route. `serving.main:/debug/predict/source` runs the bounded stored-source pipeline (FrameSource → YOLO pose → keypoint-window normalizer → random-forest). Production RTSP streams run through `worker.edge_worker`, not FastAPI lifespan startup. Missing weights/artifacts fail explicitly rather than falling back.

Edge Compose uses the production service split:

```bash
EDGE_CAMERA_CONFIG=./ml/config/edge-cameras.local.json \
  docker compose -f compose.edge.yaml up -d --build
```

`EDGE_CAMERA_CONFIG` is a gitignored per-camera JSON file. Each camera entry
holds the RTSP URL, backend `/ingest/*` URLs, camera/facility/resident identity,
`ingest_key_id`, and `ingest_secret`.

Current RTSP intake uses OpenCV. GStreamer, DeepStream, and Triton are future
adapters only. Jetson Nano is a legacy/constrained hardware-gated target; future
NVIDIA dGPU support needs release-matrix pinning before operators can rely on it.
Run `scripts/ml-edge-four-mock-rtsp-ingest-e2e.sh` from the repo root for the
deterministic synthetic RTSP-to-stub-ingest smoke.

## Boundaries

ML returns **predictions/facts only** (`fall_probability`, heartbeat, camera facts). Product-level alert decisions - policy, persistence, dedup, Kakao delivery - belong to `backend/`.
