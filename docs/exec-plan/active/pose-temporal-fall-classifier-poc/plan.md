---
slug: pose-temporal-fall-classifier-poc
status: approved
type: brownfield-poc
created: 2026-06-10
author: planner+architect+critic consensus (oh-my-claudecode)
spec: docs/exec-plan/active/pose-temporal-fall-classifier-poc/spec.md
adrs: [ADR-003, ADR-005, ADR-007, ADR-009]
issue: 40
consensus:
  planner: drafted
  architect: APPROVE-WITH-FIXES (3 blocking, all incorporated)
  critic: REWORK (3 critical + 6 major + gaps, all incorporated)
---

# Implementation Plan: Pose-Sequence Temporal Fall Classifier (PoC)

> **Status: pending-approval.** Do not execute until approved.
> Canonical destination (on approval): `docs/exec-plan/active/pose-temporal-fall-classifier-poc/plan.md`
> Execute on a worktree: `git wt 40` → branch `feat/40-pose-temporal-fall-classifier-poc`.
> This file is the consensus-revised draft (Planner → Architect → Critic). All blocking
> findings from both reviewers are folded in; ▲ marks a consensus fix vs the first draft.

---

## RALPLAN-DR Summary (Short Mode)

### Principles

1. **Reuse the existing seam, never re-implement.** `YoloPoseRunner.predict_full()`
   (`ml/demo/yolo_runtime.py:21-23`) is Stage 1 (ADR-005). Instantiate it via
   `demo.model_modules.pose_weight_path("n")` so weights resolve to `ml/weights/` (ADR-007),
   never a bare-filename auto-download. Import; do not copy.
2. **ADR-compliance is structural.** Code under `ml/training/`; derived outputs under
   `ml/data/` (ADR-007 §2 + MECE row 6); versioned artifacts under
   `ml/artifacts/fall-detector/{version}/` (ADR-003). Deviations need a new ADR.
3. **One split, one window function, deterministic enumeration.** LSTM, Transformer, RF train
   and evaluate on the same subject-wise split. ▲ Clip enumeration is `sorted()` so the split
   reconstructed in `evaluate.py` is byte-identical to `train.py`'s — the "no leakage by
   construction" guarantee depends on deterministic ordering, not the seed alone.
4. **Honesty over optimism.** Report AUC-PR alongside F1/Recall. ▲ Subject-wise splits yield
   materially lower numbers than the frame-level random splits behind published UP-Fall results
   (RF F1≈98.5%, Ramirez 2021; RF 99.33% > ViT 96.44%, Raza 2025 — both random 70:30 with
   subject leakage). Expect honest subject-wise **fall-F1 ≈ 0.6–0.85**; lower is not a bug.
5. **PoC scope discipline.** No fine-tuning, no multi-person tracking, no real-time perf tuning.
   ▲ Streamlit demo wiring IS in scope (Step 7) — the spec marks "Streamlit 데모 통합" as
   *active* (user requirement, 2026-06-10) and main now ships ADR-010 real-time per-frame live
   inference. The demo's `Classifier` registry (`ml/demo/classifiers.py`) already reserves
   `random_forest`/`lstm`/`transformer` as `available=False` "준비중" slots — Step 7 fills them.
   The plan stops at: 3-model comparison table, versioned artifacts, and all three trained
   models selectable + running live in the existing demo.

### Decision Drivers (Top 3)

| # | Driver | Why it constrains the plan |
|---|--------|---------------------------|
| D1 | ADR-007 filesystem layout | Pose cache + eval CSVs are derived outputs → `ml/data/`; weights → `ml/weights/`; never project root or `ml/training/` |
| D2 | Identical split for all 3 models | One shared `WindowDataset.split()` with `sorted()` enumeration — duplication risks leakage/misalignment |
| D3 | PyTorch + scikit-learn coexist in one uv project | sklearn RF is idiomatic 2-line fit/predict; all-PyTorch RF adds a dep and obscures the comparison |

### Viable Options (unchanged from draft; recommendations stand)

- **(a) Pose caching:** **A1 per-clip raw `.npz`** `[N_frames×17×3]` under `ml/data/upfall_poses/`
  (resumable, windowing params tunable without re-extraction). A2 pre-windowed rejected.
- **(b) Framework:** **B1 PyTorch (LSTM+Transformer) + sklearn (RF)**. B2 all-PyTorch rejected.
- **(c) Shared interface:** **C1 single `WindowDataset` with `mode: Literal["sequence","features"]`**.
  C2 separate classes rejected — C1 makes cross-model leakage impossible by construction.

---

## Requirements Summary

**Source:** Spec `.omc/specs/deep-interview-pose-temporal-fall-classifier-poc.md`
(rounds=7, final ambiguity=5.1%, PASSED). Hard constraints: ADR-003, ADR-005, ADR-007, ADR-009.

**Scope:** Stage 2 (temporal classifier training + demo wiring). Stage 1 (`YoloPoseRunner`) reused.

### Acceptance Criteria

| # | Criterion | How to verify |
|---|-----------|---------------|
| AC-1 | UP-Fall RGB → `YoloPoseRunner.predict_full()` frame-by-frame; ▲ explicit 2-tuple unpack `pose_detections, _ = predict_full(frame)`; first person `pose_detections[0] if len(pose_detections)>0 else zeros((17,3))`; ▲ int (x,y) cast to float32 then normalized; ▲ low-conf keypoint stored as `(0,0,0.0)` (conf zeroed too); per-clip `.npz` at `ml/data/upfall_poses/` | Smoke 2 clips; `npz['keypoints'].shape==(N,17,3)`, dtype float32 |
| AC-2 | `WindowDataset` T=30/stride=5; `y=1` iff overlap-with-fall-interval ≥ 50%; 5 fall activities→1, 6 ADL→0; ▲ short clip (<T) → exactly one zero-padded window | Unit test: 49%→0, 50%→1; short-clip case; label dist logged |
| AC-3 | Subject-wise split; ▲ standard UP-Fall split (subjects **1–14 train / 15–17 test**, confirmed Step 0); no subject in both sets | Hard assert `set(train)&set(test)==set()` in `split()`; tested |
| AC-4 | All 3 models on identical split; RF gets `features.py` vectors; LSTM/Transformer get `[T×51]`; no contamination | `train.py` end-to-end; 3 artifact dirs |
| AC-5 | `evaluate.py` 3-model × {fall-F1, Recall, Precision, AUC-PR}; ▲ at three operating points: 0.5, optimal-F1, and ≥0.90-recall threshold; CSV at `ml/data/eval/upfall-poc-results.csv` | File exists; all cells float |
| AC-6 | Artifacts at `ml/artifacts/fall-detector/poc-{lstm,transformer,rf}/`; `metadata.json` keys `name,version,framework,model_type,input_shape,feature_dim,dataset,seed,outputs`; ▲ plus `window`/`stride`/`operating_threshold` (so the Step 7 live adapter reconstructs windows and detects at the validated threshold); parseable by `FallDetector._load_metadata()` | `json.loads` succeeds ×3 |
| AC-7 | Gold-8 eval with best model (by AUC-PR); ▲ explicit decision rule = fraction of positive windows ≥ τ (τ documented); ▲ all-zero/no-person windows → 0; ▲ ADR-005 detection-gap annotated per clip; CSV `ml/data/eval/gold8-poc-results.csv` vs ADR-009 rule-based 0/8 floor | 8 rows; stdout compares to 0/8 |
| AC-8 | `ruff check ml/training/` exits 0 (line-length 100, E/F/I/UP, py311) | manual/CI |
| AC-9 | `docs/research/upfall-poc-verification.md`: download URL/access, license excerpt, 5+6 activity codes, ▲ subject count + standard split IDs, ▲ annotation format + per-clip FPS source (timestamp→frame) | committed with all 6 points before Step 1 |
| AC-10 | ▲ `[dependency-groups] training` includes torch, scikit-learn, ultralytics, opencv-python-headless, tqdm; `uv sync --group training` then `import torch, sklearn, cv2, ultralytics` exits 0 | lock updated; import check |
| AC-11 | ▲ All 3 trained models registered in `ml/demo/classifiers.py` (`available=True`, real factory); each runs **live** in the ADR-010 per-frame demo via a streaming windowed adapter; red-box/confidence renders on a `ml/data/processed` clip | demo launches; `random_forest`/`lstm`/`transformer` selectable; live overlay fires |

---

## Proposed Module Layout

```
ml/training/
├── __init__.py              (exists — keep)
├── README.md                (exists — update: run commands + metric-expectation note)
├── config.py                (NEW) ▲ __file__-anchored paths, seeds, hyperparams
├── extract_poses.py         (NEW) drives YoloPoseRunner over UP-Fall → per-clip .npz
├── data/
│   ├── __init__.py          (NEW)
│   ├── upfall.py            (NEW) parse annotations (CSV+FPS) → ClipMeta list
│   ├── windowing.py         (NEW) WindowDataset: window, overlap-label, subject split, modes
│   └── features.py          (NEW) RF features from [T×17×3] window
├── models/
│   ├── __init__.py          (NEW)
│   ├── base.py              (NEW) FallClassifier Protocol
│   ├── lstm.py              (NEW) PyTorch LSTM
│   ├── transformer.py       (NEW) PyTorch Transformer (▲ 51→256 input projection)
│   └── rf.py               (NEW) sklearn RandomForest
├── train.py                 (NEW) load → train 3 → emit artifacts
└── evaluate.py              (NEW) comparison table + gold-8 + ▲ threshold sweep
```

**Path mappings (ADR-003 + ADR-007):** YOLO weights `ml/weights/`; pose cache
`ml/data/upfall_poses/`; eval CSVs `ml/data/eval/`; artifacts
`ml/artifacts/fall-detector/poc-{lstm,transformer,rf}/`; training code `ml/training/`.

---

## Implementation Steps

### Step 0 — Dataset Verification + Worktree + Dependencies  ▲ (closes OQ-1, OQ-3)

**Touches:** `docs/research/upfall-poc-verification.md` (new), `ml/pyproject.toml`.

1. `git wt 40` → branch `feat/40-pose-temporal-fall-classifier-poc`. Move spec
   `.omc/specs/deep-interview-…md` → `docs/exec-plan/active/pose-temporal-fall-classifier-poc/spec.md`
   and write this plan to `…/plan.md`. First commit finalizes the plan body (AGENTS.md).
2. Write `docs/research/upfall-poc-verification.md` — **6 mandatory data points** (BLOCKING; must
   exist before any code in Steps 1–2):
   - Download URL + access method (UdeG registration form).
   - License excerpt (research-only).
   - 5 fall activity codes (positive) + 6 ADL codes (negative). ▲ **Resolve whether Activity 11
     'Lying down' is in the ADL negative set** — it collides with post-fall lying (Risk R9).
   - ▲ Subject count (17) + standard literature split (subjects 1–14 train / 15–17 test).
   - ▲ Annotation format: frame-number CSV vs timestamp CSV, per-trial file naming.
   - ▲ Per-clip FPS source (video header) for any timestamp→frame conversion.
3. ▲ Amend `ml/pyproject.toml` `[dependency-groups] training`:
   ```toml
   training = [
       "torch>=2.3",
       "scikit-learn>=1.5",
       "tqdm>=4.66",
       "ultralytics>=8.3",            # extract_poses imports demo.yolo_runtime → ultralytics
       "opencv-python-headless>=4.10", # cv2.VideoCapture in extract_poses
   ]
   ```
   This closes OQ-3: `uv sync --group training` is self-contained for the whole pipeline.
4. `uv sync --group training`; verify `python -c "import torch, sklearn, cv2, ultralytics"` exits 0.

**Acceptance:** AC-9, AC-10.

---

### Step 1 — Pose Extraction Over UP-Fall Videos

**Touches:** `ml/training/config.py`, `ml/training/extract_poses.py`, `ml/data/upfall_poses/`.

**Reuses:** `demo.yolo_runtime.YoloPoseRunner` (`:21-23`); ▲ `demo.model_modules.pose_weight_path`
(`:28-35`) for the ADR-007 weight path; `PoseDetections` alias (`:8`).

1. `config.py` — ▲ **`__file__`-anchored** (cwd-independent; fixes the double-`ml/` bug):
   ```python
   _ML_ROOT = Path(__file__).resolve().parent.parent      # → ml/
   POSE_CACHE_DIR = _ML_ROOT / "data" / "upfall_poses"
   ARTIFACT_BASE  = _ML_ROOT / "artifacts" / "fall-detector"
   EVAL_DIR       = _ML_ROOT / "data" / "eval"
   SEED = 42; T_WINDOW = 30; STRIDE = 5; OVERLAP_THRESHOLD = 0.5
   CONF_THRESHOLD = 0.2          # ▲ match demo/features.py _CONF_THRESHOLD (not 0.05)
   N_KEYPOINTS = 17; KPT_DIMS = 3; FEATURE_DIM = None  # set after features.py
   TRAIN_SUBJECTS = tuple(range(1, 15)); TEST_SUBJECTS = (15, 16, 17)
   ```
2. `extract_poses.py` — CLI `python -m training.extract_poses --input-dir <root> [--output-dir P] [--smoke-n N]`:
   - ▲ `runner = YoloPoseRunner(model_path=str(pose_weight_path("n")))` — never the bare default.
   - Walk UP-Fall tree; per video `cv2.VideoCapture` → read FPS from header → frame loop.
   - ▲ **Explicit unpack:** `pose_detections, _boxes = runner.predict_full(frame)`.
   - ▲ Person select: `person = pose_detections[0] if len(pose_detections) > 0 else None`;
     `None` → `np.zeros((17, 3), dtype=np.float32)` (this branch is now reachable).
   - ▲ Cast int (x,y) → float32; normalize (x,y) to `[0,1]` by frame (w,h).
   - ▲ Per keypoint: `conf < CONF_THRESHOLD` → store `(0.0, 0.0, 0.0)` (zero the conf too) so the
     `conf > 0` filter in `features.py` excludes it — no false velocity spikes.
   - Save `{clip_id}.npz`: `keypoints float32[N×17×3]`, `activity_id`, `subject_id`, `trial_id`, `fps`.
   - Resumable (skip cached; log skip/extract). `--smoke-n N` → first N clips ▲ *balanced across
     classes* (see Step 4 smoke note).
   - Note: `predict_full` already applies a model-level conf gate (`POSE_MODEL_CONFIDENCE`); the
     `CONF_THRESHOLD` re-zero is a defense-in-depth for borderline keypoints.

**Acceptance (AC-1):** smoke npz shape/dtype correct; no-person frame → all-zero; rerun skips.

---

### Step 2 — Windowing, Labeling, RF Features

**Touches:** `ml/training/data/{upfall,windowing,features}.py`.

1. `upfall.py` — `ClipMeta(clip_id, subject_id, activity_label:int, fall_interval:tuple|None, fps, npz_path)`.
   `load_clip_metas(pose_cache_dir, annotation_dir) -> list[ClipMeta]`: ▲ **`sorted()` by clip_id**
   (deterministic enumeration for reproducible split); parse annotation per Step 0 format; ▲ if
   timestamps, convert to frames via clip `fps`; map 5 fall→1 / 6 ADL→0.
2. `windowing.py` — `WindowDataset(clip_metas, mode: Literal["sequence","features"], config)`:
   - Sliding window start indices `0, stride, …`; ▲ clip shorter than T → exactly one zero-padded
     window (not zero, not many).
   - Label `y=1` iff `|window ∩ fall_interval| / T >= 0.5`.
   - `split(train_subjects, test_subjects)` → `(train_ds, test_ds)` with hard
     `assert set(train)&set(test)==set()`.
   - `mode="sequence"` → `float32[T×51]`; `mode="features"` → `float32[D]`.
   - Logs class distribution at init.
3. `features.py` — `extract_window_features(window:[T,17,3]) -> [D]`, NaN-safe (conf==0 → skip),
   ▲ aligned with the literature SHAP evidence and the existing `demo/features.py` definitions
   (reference it to avoid divergence). Features:
   - Per-keypoint velocity mean (Δx,Δy), total + max displacement (over `conf>0` frames only).
   - ▲ **bbox aspect-ratio** (dominant SHAP feature) mean/std/range over window.
   - ▲ **tilt angle `|sinθ|`** of the torso major axis vs vertical (shoulder-mid → hip-mid).
   - ▲ **centroid vertical drop velocity** (frame-to-frame Δ of keypoint-centroid y).
   - **torso-vertical** (shoulder-hip Y dist) mean/std; overall motion energy.
   - `D` documented in docstring → wired to `config.FEATURE_DIM`.

**Acceptance (AC-2, AC-3):** `test_training_windowing.py` (0/49%→0, 50/100%→1, ADL→all 0,
short-clip→1 window, split disjoint); `test_training_features.py` (shape, no-NaN on all-zero /
partial-conf input).

---

### Step 3 — Models (LSTM, Transformer, RF)

**Touches:** `ml/training/models/{base,lstm,transformer,rf}.py`.

1. `base.py` — `FallClassifier` Protocol: `fit(X,y)`, `predict_proba(X)->[N,2]`, `save(path)`,
   `load(path)`. ▲ Docstring notes PyTorch `fit` is a training-loop wrapper (builds Dataset/
   DataLoader, epoch loop, optimizer) — not a one-shot sklearn call.
2. `lstm.py` — `nn.LSTM(51,128,num_layers=2,batch_first=True,dropout=0.3)` → last hidden →
   `Linear(128,2)`; Adam; `CrossEntropyLoss(weight=class_weights)` (balanced); early stop
   (patience 5); batch 64; `predict_proba`=softmax; `save/load` state_dict → `model.pt`.
3. `transformer.py` — ▲ **`Linear(51→256)` input projection** + sinusoidal PE →
   `TransformerEncoderLayer(d_model=256, nhead=4, dim_feedforward=256, dropout=0.1)` ×3 →
   mean-pool over T → `Linear(256,2)` (per spec NotebookLM guidance d=256/L=3/H=4). Assert
   `d_model % nhead == 0`. Same training loop as LSTM.
4. `rf.py` — `RandomForestClassifier(n_estimators=200, class_weight="balanced", random_state=SEED,
   n_jobs=-1)`; `save/load` via `joblib` (sklearn transitive dep) → `model.pkl`.

**Acceptance (AC-4 partial):** `test_training_models.py` — Protocol structural check; `fit`+
`predict_proba` on synthetic `[32,30,51]`/`[32,D]` → `[32,2]` rows sum 1; Transformer asserts
`d_model % nhead == 0`.

---

### Step 4 — Training Script + Artifacts

**Touches:** `ml/training/train.py`, `ml/artifacts/fall-detector/poc-*/`.

`train.py` — CLI `python -m training.train --upfall-dir <pose_cache> [--smoke-n N]`:
- Sets all three seeds (`torch`, `np`, `random`).
- `load_clip_metas` → `WindowDataset` → `split(TRAIN_SUBJECTS, TEST_SUBJECTS)`.
- Logs class distribution; ▲ raises `ValueError` if fall windows < 10% **on the full run only**
  (smoke path exempt — see below).
- Trains RF → LSTM → Transformer; `model.save(artifact_dir)`.
- Emits per-model `metadata.json` (`framework` = sklearn|pytorch; RF → `input_shape:null,
  feature_dim:D`; nets → `input_shape:[30,51], feature_dim:null`; ▲ all carry `window:30,
  stride:5` for the Step 7 live adapter). ▲ Wording: this is a
  schema *change* from the `0.1.0` placeholder (drops `inputs`/`notes`, adds `model_type`/
  `input_shape`/`seed`), **backward-compatible** only because `_load_metadata()` does no
  validation — not a literal superset.
- ▲ **Smoke path:** `--smoke-n N` samples ⌈N/2⌉ fall-activity clips + ⌊N/2⌋ ADL clips
  (guarantees both classes; avoids the `compute_class_weight` single-class crash) and bypasses
  the <10% gate. Completes < 5 min CPU.

**Acceptance (AC-4, AC-6):** `train.py --smoke-n 5` completes; 3 artifact dirs; all
`metadata.json` parseable with required keys; `model.pt`/`model.pkl` present.

---

### Step 5 — Evaluation + Comparison Table

**Touches:** `ml/training/evaluate.py`, `ml/data/eval/{upfall-poc-results,gold8-poc-results}.csv`.

`evaluate.py` — CLI `python -m training.evaluate [--model-dir P] [--gold-clips-dir D]`:
- Reconstruct test split (same `load_clip_metas` `sorted()` enumeration + same SEED → identical).
- Per model: `y_prob = predict_proba(X_test)[:,1]`. ▲ Report at **three operating points** —
  fixed 0.5, optimal-F1 threshold, and the threshold meeting **Recall ≥ 0.90** (recall-primary
  per spec). Metrics: fall-F1, Recall, Precision, AUC-PR (`average_precision_score`).
- Print markdown table; write `ml/data/eval/upfall-poc-results.csv`.
- ▲ **Persist the chosen operating threshold back into each model's `metadata.json`**
  (`operating_threshold` = the Recall≥0.90 point on the validation/test set) so the Step 7 live
  adapter detects at the *validated* threshold, not a naive 0.5 — closes the train→serve skew.
- ▲ **Gold-8 secondary eval** (best model by AUC-PR):
  - Per gold-8 clip: drive `YoloPoseRunner` (same `pose_weight_path("n")`, same normalization +
    conf-zeroing as Step 1 — consistency) → windows → `predict_proba`.
  - ▲ Decision rule: clip = fall iff **(positive-window fraction) ≥ τ** (τ in config, documented).
  - ▲ All-zero / no-person windows → contribute 0 (per ADR-005, post-fall top-down clips lose
    detection — e.g. 305호 113 no-person frames; annotate the detection gap per clip so a "missed"
    fall is attributed to detection loss, not classifier error).
  - Gold-8 clip paths default `ml/data/processed/` (overridable `--gold-clips-dir`); labels from
    `docs/exec-plan/active/pose-classifier-fall-demo/gold-labels.md`.
  - Write `gold8-poc-results.csv` (`clip_id, gold_label, predicted_label, pos_window_frac,
    no_person_frac, correct`); print total /8 vs ADR-009 floor 0/8.

**Acceptance (AC-5, AC-7):** both CSVs present; upfall table 3×4 (×3 op-points) float; gold-8 8 rows.

---

### Step 6 — Tests, Lint, README

**Touches:** `ml/tests/test_training_*.py`, `ml/training/README.md`.

- `test_training_windowing.py`, `test_training_features.py`, `test_training_models.py`,
  `test_training_artifacts.py` (after `train.py --smoke-n 2` — ▲ now non-degenerate via balanced
  smoke sampling).
- `README.md`: run commands (setup/extract/train/evaluate/demo), smoke recipe, artifact
  locations, ▲ **metric-expectation note** (subject-wise fall-F1 ≈ 0.6–0.85; not a bug).
- `uv run ruff check ml/training/ ml/tests/test_training_*.py` → 0.

**Acceptance (AC-8):** `uv run pytest ml/tests/test_training_*.py -v` and full
`uv run pytest ml/tests/ -v` exit 0; ruff 0.

---

### Step 7 — Live Demo Integration via the `Classifier` Registry  ▲ (NEW — resolves spec "active" + ADR-010)

**Touches:** `ml/demo/classifiers.py` (registry + new adapter), `ml/training/models/*` (load path),
`ml/tests/test_demo_temporal_classifier.py` (new). **Not** `ml/serving/FallDetector` — that is a
separate FastAPI consumer; the live demo runs off the `Classifier`/`ModelModule` seam.

**Rationale:** Spec marks "Streamlit 데모 통합" *active* (user: "우리 streamlit에서 실행이
되도록"); main ships ADR-010 real-time per-frame demo. The registry already reserves
`random_forest`/`lstm`/`transformer` as `available=False` slots (`classifiers.py:102-119`).

**▲ Correct seam = `ModelModule`, not `Classifier`.** `live_view.iter_live_frames(source, model)`
(`live_view.py:37-51`) only calls `model.predict(frame) -> DetectionResult`. The trained models need
a **raw-keypoint window `[T×51]`** with frame-to-frame state, but `Classifier.update(features:
FrameFeatures, time_sec)` (`classifiers.py:33`) passes only 4 scalars and `FallClassifierModule`
discards keypoints first. The clean bridge is a new **`ModelModule`** (where full keypoints + cross-
frame state live naturally) — so `live_view.py` and `RuleBasedClassifier` stay **untouched**:

1. **`TemporalFallClassifierModule`** (new `ml/demo/temporal_module.py`) implementing `ModelModule`:
   - Composes a `YoloPoseModule` (pose) + a loaded artifact (`models/{lstm,transformer,rf}.py`
     `.load()`), reading `T`/`stride`/`operating_threshold` from the artifact `metadata.json`
     (must equal training values — RF window features rebuilt identically via
     `training.data.features`, normalization identical to Step 1).
   - In `predict(frame)`: run pose → push primary person's `[51]` into a length-T ring buffer
     (no-person/low-conf → zeros, per Step 1 + R10) → every `stride` frames run `predict_proba`
     → `is_fall = prob >= operating_threshold` ▲ (validated point, not 0.5) → return
     `DetectionResult` whose primary label is **`text="낙상"`, `is_fall=True`, `confidence=prob`**
     so `render_yolo_overlay` paints the red box + "낙상"; otherwise `text="정상"`. Holds last
     verdict between strides.
2. Wire into `app.py:_build_model` (`:97-106`): when the selected key is temporal, build the
   `TemporalFallClassifierModule` instead of `FallClassifierModule`. Flip registry
   `random_forest`/`lstm`/`transformer` → `available=True`; graceful error if artifact absent.
3. Smoke: launch demo on a `ml/data/processed` clip; select each model; confirm pose renders live,
   inference runs per-frame, and **"낙상" + red box fires on a fall** (the user's explicit goal),
   per ADR-010.

**Acceptance (AC-11):** all 3 models selectable; live pose overlay + per-frame inference; "낙상"
label + red box on fall; `T`/`stride`/`threshold` from metadata; `live_view.py` and
`RuleBasedClassifier` unchanged.

---

## Risks and Mitigations

| # | Risk | Sev | Mitigation |
|---|------|-----|------------|
| R1 | UP-Fall download/access (~14 GB, registration) | HIGH | Verify in Step 0 before code. Fallback UR-Fall per `docs/research/fall-detection-datasets.md`. ADR follow-up. |
| R2 | Class imbalance (~15–25% fall) | HIGH | class weights (nets) + `class_weight="balanced"` (RF); AUC-PR mandatory; <10% gate on full run. |
| R3 | Subject-wise split correctness | HIGH | hard assert in `split()`; tested; standard IDs 1–14/15–17 from Step 0. |
| R4 | RF feature leakage | MED | per-window features, no global fit; any later norm fit on train only. |
| R5 | Torch CPU speed | MED | `--smoke-n N`; `device=cuda/mps/cpu` autodetect; wall-clock in README. |
| R6 | UP-Fall side-view vs nursing-home top-down (ADR-009) | MED | acknowledged PoC limit; gold-8 measures gap; don't inflate. |
| R7 | Reproducibility across machines | LOW | seeds fixed; deps pinned `uv.lock`; ▲ `sorted()` enumeration. |
| R8 | Transformer nhead divisibility | LOW | ▲ d_model=256, nhead=4 (256%4==0); assert at init. |
| ▲ R9 | **Post-fall "lying still" ≈ Activity 11 'Lying'** — identical poses, opposite labels (Ramirez's dominant confusion) | HIGH | Step 0 resolves whether Activity 11 ∈ ADL; mitigation option: label fall interval as onset±N s (not to clip end), or exclude Activity 11; eval notes must state dominant confusion when precision low. |
| ▲ R10 | **Gold-8 detection gap** — top-down/bedridden clips lose person detection post-fall (ADR-005: 25–73% rate) → all-zero windows | MED | all-zero windows → 0; report `no_person_frac` per clip; attribute misses to detection loss vs classifier. |
| ▲ R11 | **Split reconstruction divergence** if pose-cache file set differs between train/eval | MED | `sorted()` deterministic enumeration; eval asserts test-subject set matches config. |

---

## Verification Commands  ▲ (run from repo root; `__file__`-anchored config makes paths cwd-safe)

```bash
cd ml
uv sync --group training
python -c "import torch, sklearn, cv2, ultralytics"                    # AC-10
uv run python -m training.extract_poses --input-dir data/upfall_raw --smoke-n 2
uv run pytest tests/test_training_windowing.py tests/test_training_features.py \
              tests/test_training_models.py tests/test_training_artifacts.py -v
uv run python -m training.train --upfall-dir data/upfall_poses --smoke-n 5
uv run python -m training.evaluate
uv run ruff check training/ tests/test_training_*.py
uv run pytest tests/ -v
```
(▲ `--input-dir`/`--upfall-dir` are relative to `ml/` after `cd ml`; no double-`ml/` prefix.)

---

## Open Questions (▲ OQ-1/OQ-3 now resolved in Step 0)

| # | Question | Status |
|---|----------|--------|
| OQ-1 | UP-Fall annotation format + FPS source | ▲ **resolved in Step 0** (BLOCKING gate) |
| OQ-2 | Standard subject split IDs | ▲ 1–14 train / 15–17 test (confirm Step 0) |
| OQ-3 | dep group membership for extract_poses | ▲ **resolved** — both added to `training` |
| OQ-4 | gold-8 clip dir | ▲ default `ml/data/processed/`, `--gold-clips-dir` override |
| OQ-5 | artifact version convention `poc-*` vs nested | open → ADR follow-up |
| ▲ OQ-6 | Activity 11 'Lying' ∈ ADL negative set? | open → resolve Step 0 (drives R9) |
| ▲ OQ-7 | Demo keypoint-streaming seam: sibling `TemporalClassifierModule` with `update_window()` vs extend `FallClassifierModule` to pass keypoints — without breaking `RuleBasedClassifier`'s `update(features,…)` | open → resolve at Step 7 (prefer non-breaking sibling) |

---

## ADR Follow-ups (after PoC)

- **ADR-dataset-upfall:** distill dataset choice (UP-Fall vs UR-Fall) after Step 0.
- **ADR-artifact-versioning-multi-model:** canonical multi-model artifact path (OQ-5).

---

## Plan Status

```
status: pending-approval
worktree: git wt 40
branch: feat/40-pose-temporal-fall-classifier-poc
handoff: /oh-my-claudecode:start-work pose-temporal-fall-classifier-poc
```
