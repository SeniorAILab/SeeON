# ADR-003: ML Serving/Training Lifecycle Split and Responsibility Boundary

## Status

Accepted

## Date

2026-06-07

## Context

The `ml/` package sits at the intersection of two distinct software lifecycles
with radically different runtime, dependency, and operational characteristics.

**Training lifecycle (batch).** Consumes raw video data, runs computationally
expensive pose-estimation and temporal classification, and produces a versioned
model artifact. This lifecycle requires heavyweight dependencies — ultralytics
(YOLO11-pose), PyTorch, albumentations, and experiment-tracking frameworks such
as MLflow or Weights & Biases — and runs infrequently, triggered manually or by
a CI job when a new dataset is ready. `ml/training/` is scaffolded and the
pipeline is operational (`config.py`, `extract_poses.py`, `train.py`,
`evaluate.py`, `metadata.py`, `data/`, `models/`).

**Serving lifecycle (online).** Loads a pre-built artifact and answers inference
requests in real time. It must be always-on, boot quickly, and carry a minimal
dependency footprint. The serving surface is a FastAPI application exposing
exactly two HTTP endpoints: `GET /health` and `POST /predict`.

Beyond the lifecycle split, the system requires a hard boundary between
**ML inference** and **product-level alert logic**. Without an explicit
boundary, alert policy, deduplication, and external webhook dispatch (Kakao)
could drift into the ML service — coupling two concerns that must evolve
independently.

A third surface, a Streamlit demo UI (`ml/demo/app.py`), lives inside the same
uv project for rapid PoC experimentation. It must not be confused with the
product frontend (`front/`, Next.js/TypeScript), which is the user-facing
application.

Finally, the team evaluated whether to deploy NVIDIA Triton Inference Server
immediately, given that the chosen artifact layout is inspired by Triton's
model-repository convention.

## Decision

### 1. Two explicit lifecycles inside one uv project

`ml/` declares two named lifecycles in its directory structure and
`pyproject.toml` description:

- `serving/` — online lifecycle; FastAPI application; always-on.
- `training/` — batch lifecycle; scaffolded; pipeline operational.

Both coexist inside a single uv project rather than two separate projects,
keeping dependency resolution, tooling configuration (ruff), and artifact path
resolution unified under one `pyproject.toml` and `uv.lock`.

### 2. Dependency groups enforce the lifecycle split

`pyproject.toml` uses uv `[dependency-groups]` to isolate dependencies by
lifecycle:

```toml
# Serving (online) — always installed
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.30",
    "pydantic>=2",
    "numpy>=1.26",
]

[dependency-groups]
demo = [
    "opencv-python-headless>=4.10",
    "streamlit>=1.38",
    "ultralytics>=8.3",
]
training = [
    "torch>=2.3",
    "scikit-learn>=1.5",
    "joblib>=1.4",
    "tqdm>=4.66",
    "ultralytics>=8.3",
    "opencv-python-headless>=4.10",
]

[tool.uv]
# demo, test, and training are default-groups so bare `uv sync` installs
# everything. Slim serving images use --no-default-groups.
default-groups = ["demo", "test", "training"]
```

Bare `uv sync` installs all `default-groups` (demo, test, training). A slim
production serving host that should not carry training tooling uses
`uv sync --no-default-groups`. The dependency-group structure still enforces
the lifecycle split — slim is opt-in via an explicit flag, not the default.

### 3. Version-addressed artifact directory (Triton-inspired layout, not Triton itself)

Artifacts are stored at `ml/artifacts/<model-name>/<version>/`, mirroring the
Triton model-repository convention without deploying Triton. The placeholder
artifact exists at:

```
ml/artifacts/fall-detector/0.1.0/
  metadata.json   # name, version, status, input/output schema
  (model.pt)      # absent until real weights are trained; gitignored
```

`metadata.json` records the output contract (`"fall_probability": "float in
[0, 1]"`) in machine-readable form before real weights exist, establishing the
schema as a first-class artifact rather than implicit documentation.

`serving/model.py` locates artifacts at runtime by resolving relative to its
own file:

```python
ARTIFACTS_DIR = Path(__file__).resolve().parent.parent / "artifacts"
```

`FallDetector(name="fall-detector", version="0.1.0")` loads `metadata.json` if
present and falls back gracefully to an in-memory dict if the file is absent,
ensuring the server starts even in a fresh checkout without weights.

### 4. Hard ML/backend responsibility boundary

The FastAPI serving app returns **predictions only**. The `PredictResponse`
schema in `serving/main.py` is:

```python
class PredictResponse(BaseModel):
    model: str
    version: str
    fall_probability: float   # in [0, 1]; the only ML output
```

The module docstring states this explicitly: *"ML returns predictions only.
Product-level alert decisions (policy, dedup, webhook dispatch) belong to the
backend, not here."*

`backend/` (NestJS) owns all product logic: whether a given `fall_probability`
value crosses an alert threshold, deduplication of consecutive predictions, and
dispatching the Kakao webhook.

### 5. Streamlit demo is an ML-demo surface, not the product frontend

`ml/demo/app.py` is a PoC harness that lets developers exercise the full
inference path without a running NestJS backend. Its module docstring is
explicit: *"This is an ML demo surface, NOT the product frontend. The product
frontend is `front/` (Next.js); product-level alerts/webhooks live in
`backend/` (NestJS)."*

It is launched via `pnpm dev:demo` from the repo root (which resolves to
`uv run --directory ml --group demo streamlit run demo/app.py`). It uses an
in-process model pipeline via `demo.classifiers` and `demo.model_modules`,
bypassing the HTTP layer — an acceptable shortcut for demo purposes only.

## Alternatives Considered

### A. Single process/lifecycle for training and serving

**Rejected.** A monolithic process that owns both training (long-running batch
jobs) and real-time serving cannot be stopped for training runs without taking
down the prediction API. It also forces training's heavyweight dependencies
(torch, ultralytics) onto every production host running the serving API. The
lifecycle cadences are fundamentally different: serving must be always-on and
stateless between requests; training runs infrequently and maintains checkpoints
across a long-running job.

### B. Embed the model directly in the NestJS backend

**Rejected.** Running Python inference inside a Node.js process requires either
spawning child processes (fragile, no type safety across the boundary) or
Node.js ONNX runtime bindings (immature for pose-based temporal classifiers).
It would also couple the model's Python environment to the backend's Node.js
dependency graph, making independent upgrades of either component impossible.
The FastAPI serving boundary keeps Python and TypeScript runtimes cleanly
separated and lets the ML team iterate on inference logic without touching
NestJS.

### C. No artifact versioning — load weights from a fixed path

**Rejected.** A single `model.pt` at a fixed path provides no mechanism to run
two versions side-by-side (canary / rollback), makes it impossible to determine
from a health check which weights are loaded, and breaks traceability (which
dataset produced which weights). The `<model-name>/<version>/` layout costs
nothing at PoC time but avoids a disruptive migration once real weights exist.

### D. Deploy full NVIDIA Triton Inference Server now

**Rejected.** Triton requires a GPU-capable host, gRPC/HTTP model-management
protocol, Triton-specific model-repository file-format compliance (including
`config.pbtxt`), and non-trivial Kubernetes or Docker Compose configuration.
None of this is justified while real model weights do not exist. The artifact
directory *layout* is Triton-compatible, so migrating to Triton later is a
deployment-configuration change, not a code change.

## Consequences

**Positive:**

- `uv sync --no-default-groups` on a serving host installs only the four
  serving dependencies; training tooling (torch, ultralytics, etc.) is
  excluded. Bare `uv sync` installs all default-groups for full dev use.
- The end-to-end PoC path — `video sample → windowing → FallDetector.predict()
  → FastAPI /predict → backend webhook` — is exercisable today using placeholder
  weights and the deterministic dummy inference in `model.py`.
- `fall_probability: float` as the sole ML output is a stable, versionable
  contract between ML and backend; either side can change its internal
  implementation without coordinating with the other, as long as the contract
  holds.
- Artifact versioning is in place before real weights exist; the first trained
  model drops into `fall-detector/0.2.0/` with no structural changes to serving
  or backend code.
- The Streamlit demo gives the team an immediate, dependency-isolated scratchpad
  for testing inference without standing up the full product stack.

**Negative / Trade-offs:**

- Two separate invocation paths (HTTP for production, in-process
  `demo.classifiers` pipeline for the demo) mean the demo bypasses request
  validation and HTTP middleware; it must not be used for performance or
  correctness benchmarking.
- The `training` dependency-group is a `default-group`; slim serving images
  that must not carry training tooling require an explicit
  `--no-default-groups` flag — the default is developer-friendly, not
  production-lean.
- The FastAPI microservice introduces a network hop between backend and ML that
  would not exist with in-process inference. For fall detection, where latency
  tolerance is on the order of seconds rather than milliseconds, this is
  acceptable at PoC and early production scale.
- The ML/backend responsibility boundary is enforced by convention and
  code-review, not by a schema registry or contract test. Drift is possible if
  future contributors add alert logic to `ml/serving/`.
