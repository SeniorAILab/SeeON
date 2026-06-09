# Training Pipeline — Le2i Temporal Fall Classifier

A clip-wise sliding-window fall-detection pipeline for the
[Le2i Fall Detection Dataset](http://le2i.cnrs.fr/) (Charfi et al., 2013).
Three model families are supported: **LSTM**, **Transformer**, and **Random Forest**.

---

## Setup

```bash
# Install training + demo deps (adds torch, sklearn, ultralytics, opencv, etc.)
uv sync --group training
```

All commands below are run from `ml/`.

---

## Full Pipeline

### Step 1 — Extract poses

Run YOLO-pose inference on every Le2i `.avi` clip and cache normalised
COCO-17 keypoints as `.npz` files.

```bash
uv run python -m training.extract_poses \
    --input-dir  data/le2i_raw \
    --output-dir data/le2i_poses
```

Expected Le2i layout under `data/le2i_raw/`:

```
data/le2i_raw/
    Coffee_room/
        video (1).avi
        video (2).avi
        ...
        Annotation_files/
            video (1).txt   # two-line fall interval (see below)
            ...
    Home/  ...
    Office/  ...
    Lecture_room/  ...
```

**Le2i annotation format** — each `.txt` file contains exactly two lines:

```
<start_frame>    # fall onset (1-based); 0 signals ADL (no fall event)
<end_frame>      # fall end   (1-based, inclusive)
```

Smoke run — first N clips only, useful for CI / sanity checks:

```bash
uv run python -m training.extract_poses \
    --input-dir  data/le2i_raw \
    --output-dir data/le2i_poses \
    --smoke-n 5
```

---

### Step 2 — Train

```bash
uv run python -m training.train --model lstm
uv run python -m training.train --model transformer
uv run python -m training.train --model rf
```

Trained artifacts are written to `ml/artifacts/fall-detector/{model_type}/`:

```
artifacts/fall-detector/lstm/
    model.pt          # PyTorch state dict
    metadata.json     # threshold, window geometry, feature_dim, ...

artifacts/fall-detector/transformer/
    model.pt
    metadata.json

artifacts/fall-detector/rf/
    model.pkl         # joblib-serialised sklearn RandomForestClassifier
    metadata.json
```

---

### Step 3 — Evaluate

```bash
uv run python -m training.evaluate --model lstm
uv run python -m training.evaluate --model transformer
uv run python -m training.evaluate --model rf
```

Results (clip-wise AUC, F1, confusion matrix) are written to `data/eval/`.

---

### Step 4 — Live demo

```bash
uv run --group demo streamlit run demo/app.py
```

The Streamlit app loads the trained model from `artifacts/fall-detector/` and
runs the temporal adapter on a live webcam or uploaded video.

---

## Metric Expectations

> **Clip-wise fall-class F1 ≈ 0.6–0.85 is normal and is NOT a bug.**

This pipeline uses a **clip-level split** (no same-clip frames in both train
and test sets).  Published numbers that look higher (> 0.90 F1) typically use a
frame-level random split, which leaks temporal context across the boundary and
artificially inflates scores.  The clip-wise split reflects realistic deployment
conditions where the model encounters entirely unseen recording sessions.

Key parameters governing the metric (all in `training/config.py`):

| Parameter | Default | Effect |
|-----------|---------|--------|
| `T_WINDOW` | 30 frames | Window length fed to the model |
| `STRIDE` | 5 frames | Sliding-window step |
| `OVERLAP_THRESHOLD` | 0.5 | Fraction of window overlapping the annotated fall interval required for `y=1` |
| `TEST_SPLIT_FRACTION` | 0.25 | Held-out clip fraction |

---

## Artifact Locations

| Path | Contents |
|------|----------|
| `data/le2i_raw/` | Raw Le2i `.avi` clips + annotation `.txt` files |
| `data/le2i_poses/` | Extracted `.npz` pose caches (Step 1 output) |
| `artifacts/fall-detector/lstm/` | Trained LSTM model + metadata |
| `artifacts/fall-detector/transformer/` | Trained Transformer model + metadata |
| `artifacts/fall-detector/rf/` | Trained Random Forest model + metadata |
| `data/eval/` | Evaluation reports (Step 3 output) |
