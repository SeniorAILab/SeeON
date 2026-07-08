# ml

Python (uv) project. Owns **two lifecycles**:

- `training/` — **batch**: dataset → model artifact.
- `api/` — **online gateway**: private/local FastAPI app exposing health, status, models, relay routes, and bounded control surfaces; no ML/model loading.
- `worker.edge_worker` — **online worker**: production RTSP camera ownership, model/domain evaluation, heartbeat/alert fact creation, and local relay to `ml-api`.

Production live path: `RTSP -> ml-worker -> ml-api /api/v1/relay/* -> backend /api/v1/events` (ADR). `ml-api`
does not own production RTSP or raw frame relay; it owns backend Event API gateway side effects.

Plus `demo/` (Streamlit ML-demo UI), `tests/`, and `models/` artifact storage.

## Layout

```
ml/
  pyproject.toml          # uv project; api deps + demo/training groups
  contracts/              # shared frame/model/artifact/observation contracts
  features/               # feature extraction and window transforms
  events/                 # edge event DTOs/emitters
  api/                    # FastAPI gateway (/health/*, /status, /models, /api/v1/relay/*); no ML/model loading
  worker/                 # ml-worker process + worker-owned live ML packages and orchestration/state
    sources/              # camera/video/upload frame sources and registries
    runners/              # task/model runner registry wiring
    perception/           # pose detection, observation construction, and perception adapters
    domains/              # domain-specific policy/value objects
  training/               # batch training, evaluation, and artifact production
  demo/                   # Streamlit local demo UI
  tests/                  # pytest coverage for package boundaries and behavior
  models/                 # ADR model artifacts (gitignored weights where applicable)
    pose/                 # YOLO pose weights resolved by contracts.artifacts.pose_weight_path()
    fall/                 # trained fall-classifier artifacts and metadata
  data/                   # local datasets/uploads (gitignored)
    raw/  processed/  uploads/
```

The artifact layout is path-addressed under `ml/models/` per ADR. Pose weights cache under `ml/models/pose/`; trained fall-classifier files live under the model-family directories used by the training catalog. Do not reintroduce retired model/version artifact trees.

## Commands (from repo root)

```bash
pnpm dev:ml          # FastAPI api on :8000
pnpm dev:ml:worker   # python -m worker; reads gitignored worker/ml-worker.local.yaml
pnpm dev:ml:demo     # Streamlit demo
```

> `worker/ml-worker.local.yaml` is gitignored (per-camera RTSP URL + relay token). Copy it once with
> `cp worker/ml-worker.example.yaml worker/ml-worker.local.yaml`, then set `artifact_dir: ./models/fall/lstm`
> (paths are relative to `ml/` for `uv run --directory ml`) and a real/external `rtsp_url`. `python -m worker`
> and `python -m worker.edge_worker` are equivalent entry points; validate with `pnpm dev:ml:worker --check-config`.

Or directly:

```bash
uv sync                                      # install slim api gateway deps
uv sync --group demo                         # add Streamlit demo deps
uv sync --group training                     # add offline training deps
uv run uvicorn api.main:app --reload --port 8000
uv run python -m worker --config worker/ml-worker.local.yaml --heartbeat-on-start   # or: python -m worker.edge_worker
uv run --group demo streamlit run demo/app.py
```

Pose-window classification is a live `ml-worker` responsibility; the Streamlit demo runs the same bounded pose-window flow in-process for local operator/developer use. FastAPI `api` is a gateway/status/relay surface only and does not host prediction routes or load model artifacts. Missing worker/demo weights/artifacts fail explicitly rather than falling back.

Edge Compose uses the production service split:

```bash
pnpm edge:preflight
docker compose --env-file .env.edge.prod -f compose.edge.yaml pull
docker compose --env-file .env.edge.prod -f compose.edge.yaml up -d
```

Edge production uses already-built image refs from `.env.edge.prod`; do not use
`--build` on the edge host. `pnpm edge:preflight` fails before `docker compose`
when Docker cannot expose the NVIDIA runtime needed by `ml-worker`. Backend
`/api/v1/events` URL and relay-token configuration live in `ml-api`.

Runtime camera registrations made through `ml-api` are stored at
`/var/lib/ml-api/cameras.json` by default. Edge Compose mounts this path through
the `ml-api-state` volume so operator-created camera registry state survives
container recreates. Treat this as edge-local state: back it up for manual edge
operation, or replace it with backend config pull for managed production rollout.

For first-stream QA before the backend camera config API is populated, seed the
ml-api camera registry from the sanitized example and then edit only the private
runtime copy:

```bash
mkdir -p ml/.runtime/ml-api
cp ml/api/cameras.example.json ml/.runtime/ml-api/cameras.json
API_CAMERA_STORE=$PWD/ml/.runtime/ml-api/cameras.json pnpm dev:ml
```

The example uses the reserved `.invalid` domain and contains no credentials,
real camera IPs, or tokens. Replace its `rtsp_url` only inside
`ml/.runtime/ml-api/cameras.json`; that runtime directory is gitignored.

Current RTSP intake uses OpenCV. GStreamer, DeepStream, and Triton are future
adapters only. Jetson Nano is a legacy/constrained hardware-gated target; future
NVIDIA dGPU support needs release-matrix pinning before operators can rely on it.

## Boundaries

ML returns **predictions/facts only** (`fall_probability`, heartbeat, camera facts). Product-level alert decisions - policy, persistence, dedup, Kakao delivery - belong to `backend/`.
