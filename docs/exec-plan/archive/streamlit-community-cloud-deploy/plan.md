---
slug: streamlit-community-cloud-deploy
title: "Demo — Streamlit Community Cloud Deployment — Execution Plan"
type: plan
date: 2026-06-12
owner: gobeumsu
issue: 90
status: discarded
---
<!-- NOTE: plan body is immutable after finalize (first commit including this file).
     Scope change -> new slug + status: superseded-by. -->

# Plan: Demo — Streamlit Community Cloud Deployment

Deploy `ml/demo/app.py` to Streamlit Community Cloud (official hosting),
alongside the already-live HF Space (`Berom0227/eldercare-fall-demo`).
Cloud builds straight from the GitHub repo, which carries no model weights
(`ml/models/` is gitignored; deny-assets blocks committing them), so weights
must be reacquired at boot.

## Step 1 — Weight custody: public HF model repo

Fall classifier weights + ADR-015 metadata.json live at
`Berom0227/eldercare-fall-models` (HF model repo, public — weights contain no
footage). Pose weights need no custody: `demo/model_modules.py` already lets
ultralytics auto-download into `ml/models/pose/`.

## Step 2 — `demo/model_bootstrap.py` (boot-time reacquire)

`ensure_fall_models() -> None`: if `ml/models/fall/` is missing/empty,
`huggingface_hub.snapshot_download(repo_id="Berom0227/eldercare-fall-models",
local_dir=<ml root>/models/fall)`. Lazy-import `huggingface_hub` and no-op
when weights are present, so local operator runs never touch the network.
Called once from `app.py` right after page config (before any model load).

## Step 3 — `demo/requirements.txt` (Cloud dependency file)

Community Cloud resolves dependencies from the entrypoint directory first, so
the file lives next to `app.py` — the monorepo root and `ml/` uv project stay
untouched. Contents: CPU-only torch index + the demo's actual inference deps
(streamlit, ultralytics, opencv-python-headless, torch, scikit-learn, joblib,
numpy) + huggingface_hub for Step 2.

## Step 4 — Manual deploy (web UI; no CLI exists)

share.streamlit.io → New app → repo `GoBeromsu/eldercare-fall-ai` (grant
private-repo access), branch `main`, main file `ml/demo/app.py`, Python 3.11.
`FALL_DEMO_MODE` stays unset → public mode (fail-safe; ADR-012 boundary).

## Acceptance

- `uv run pytest tests/ -q` green; bootstrap unit-verified by downloading the
  HF model repo into a temp dir and matching the local `models/fall/` tree.
- Cloud app boots, accepts an upload, runs pose overlay + fall inference.

## Known risk (accepted in #90)

Community Cloud guarantees 1GB RAM; torch + ultralytics video inference may
OOM. HF Space (16GB) remains the production-grade fallback; this deployment
is the official-hosting track requested for the demo.
