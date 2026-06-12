---
slug: demo-registry-driven-model-loading
title: "Streamlit Demo — Registry-Driven Model Loading & Threshold Policy — Execution Plan"
type: plan
date: 2026-06-12
owner: gobeumsu
issue: 74
created-from-spec: demo-registry-driven-model-loading/spec.md
status: done
---
<!-- NOTE: plan body is immutable after finalize (first commit including this file).
     Scope change -> new slug + status: superseded-by. -->

# Plan: Streamlit Demo — Registry-Driven Model Loading & Threshold Policy

## Step 1 — Lightweight catalog (single source of truth)

New `ml/training/models/catalog.py`: a pure-declaration `CATALOG` dict
(key → module path, class name, mode, artifact_filename) with **no heavy imports**.
`ml/training/models/__init__.py` builds the existing `REGISTRY` from `CATALOG` via
importlib so train/evaluate/harness dispatch is unchanged (same keys, same
`factory`/`mode`/`artifact_filename` structure). Test: `set(REGISTRY) == set(CATALOG)`
and factories match the catalog class names.

## Step 2 — Demo derives from the catalog

`demo/temporal_module.py`:
- `TEMPORAL_MODEL_KEYS`, `_KEY_TO_MODE`, `_KEY_TO_ARTIFACT` computed from `CATALOG`
  (demo key = training key with `-` → `_`; preserves existing `random_forest` key).
- `build_temporal_model(key, pose, threshold_override=None)`: replace the if/elif
  ladder with importlib load of the catalog entry's class → `.load(adir)`
  (lazy-import policy intact); `threshold_override` takes precedence over
  `metadata.operating_threshold`.

`demo/classifiers.py`: `CLASSIFIER_REGISTRY` built as rule_based + one spec per
temporal key (availability from the artifact probe; display-name map with
title-case fallback; "(준비중)" suffix preserved).

## Step 3 — Threshold policy surface

New `demo/thresholds.py`: `NH_RECOMMENDED_THRESHOLDS` (demo-key → float; values and
provenance cite `ml/experiments/analysis/phase3-step2-nh-threshold-policy.md` v2) and
`default_threshold(key)` → NH value, else metadata `operating_threshold`, else None.
`demo/demo_ui.py`: `select_decision_threshold(spec)` renders the 판정 임계값 slider
(0.0–1.0) defaulting to `default_threshold`; `build_model(...)` gains
`decision_threshold` and passes it to `build_temporal_model`. `app.py` wires it.
`docs/rules/streamlit-demo.md` Rule 1 gains the slider as an allowed control.

## Step 4 — Tests + verification

- New `tests/test_demo_registry_catalog.py`: catalog↔REGISTRY lockstep, demo-key
  derivation, threshold-default resolution (NH override vs metadata fallback),
  threshold_override plumbing.
- Existing suites must stay green unmodified (they assert contracts, not fixed lists).
- Headless smoke: build every artifact-present family with a fake pose module;
  verify gcn reconstructs from arch.json and reports the expected default threshold.

## Acceptance

- `uv run pytest tests/ -q` green.
- Smoke output lists all six families loadable; gcn default threshold 0.30.
- User confirms visually in Streamlit operator mode (out of band).
