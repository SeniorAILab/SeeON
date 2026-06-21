# ml

Python (uv) project. Owns **two lifecycles**:

- `training/` — **batch**: dataset → model artifact.
- `serving/` — **online**: FastAPI app exposing edge predictions. Always-on.

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
pnpm dev:demo    # Streamlit demo
```

Or directly:

```bash
uv sync                                      # install slim serving deps
uv sync --group demo --group training        # full serving: cv2 + ultralytics + sklearn/joblib for pose→RF inference
uv run --group demo --group training uvicorn serving.main:app --reload --port 8000
uv run --group demo streamlit run demo/app.py
```

`serving.main:/debug/predict/window` is the canonical `[T][51]` pose-window classification route. `serving.main:/debug/predict/source` runs the bounded stored-source pipeline (FrameSource → YOLO pose → keypoint-window normalizer → random-forest). That path requires `opencv-python-headless`, `ultralytics`, `scikit-learn`, and `joblib`; missing weights/artifacts fail explicitly rather than falling back.

## Boundaries

ML returns **predictions only** (`fall_probability`). Product-level alert decisions — policy, persistence, dedup, Kakao delivery — belong to `backend/`.
