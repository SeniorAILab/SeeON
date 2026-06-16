# ml

Python (uv) project. Owns **two lifecycles**:

- `training/` — **batch**: dataset → model artifact. (Deferred for PoC.)
- `serving/` — **online**: FastAPI app exposing predictions. Always-on.

Plus `demo/` (Streamlit ML-demo UI) and version-addressed `artifacts/`.

## Layout

```
ml/
  pyproject.toml          # uv project; serving deps + demo/training groups
  serving/                # FastAPI online serving (/health, /predict)
  training/               # batch training (deferred)
  demo/app.py             # Streamlit demo UI
  artifacts/              # <model-name>/<version>/{model.pt, metadata.json}
    fall-detector/0.1.0/
  data/                   # relocated from old assets/ (gitignored)
    raw/  processed/
```

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

`serving.main:/predict` runs the full stored-source pipeline
(FrameSource → YOLO pose → keypoint-window normalizer → random-forest). That
path requires `opencv-python-headless`, `ultralytics`, `scikit-learn`, and
`joblib`; missing weights/artifacts fail explicitly rather than falling back.

## Boundaries

ML returns **predictions only** (`fall_probability`). Product-level alert
decisions — policy, dedup, Kakao webhook — belong to `backend/`.
