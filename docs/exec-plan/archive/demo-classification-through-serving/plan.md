---
slug: demo-classification-through-serving
issue: 251
author: gobeumsu
date: 2026-06-19
status: done
---

# Demo fall classification runs through serving /predict (single path)

## Why

`docs/rules/streamlit-demo.md` §8 + ADR-029: the demo must take the **same single
code path** as production. The fall-decision signal must come from the real
ml-serving `/predict`, not an in-process shortcut. Today the demo classifies
in-process at `ml/core/temporal_module.py:271`, bypassing serving — a §8 violation.

Decision (confirmed 고범수): **serving owns the classification decision** (RF
window30, threshold 0.09). The demo classifier selectbox no longer drives it.

## How

1. **`ml/core/serving_client.py`** (new) — `ServingFallClassifier`:
   - `predict_proba(X)` with `X = float[N, W, 51]` (the raw per-track window batch).
   - For each row: reshape to `list[list[float]]`, POST `{"window": ...}` to
     `{FALL_SERVING_URL}/predict` (stdlib `urllib.request`, mirroring
     `core/alert_client.py` — no new dependency).
   - Parse `fall_probability` → return `[N, 2]` (`[1-p, p]`).
   - **Fail loud** on HTTP / parse error (no silent fallback, §8 / ADR-014).

2. **`ml/core/temporal_module.py` `build_temporal_model`** — when
   `FALL_SERVING_URL` is set: build with `model=ServingFallClassifier(...)` and
   force `mode="sequence"` so the raw `[W][51]` window is emitted; serving runs
   `window_to_features` + decides. window/stride/operating_threshold still read
   from the shared artifact `metadata.json` (same `ml/models` dir → same numbers
   as serving). When unset → current in-process path (bench/tests/offline).

   `# ponytail:` the env gate is a deployment config, not an `if-demo` branch —
   when the demo runs for real the runbook sets `FALL_SERVING_URL` and the path
   is serving-only and fails loud.

3. Pose extraction stays edge-local (overlay + window assembly) — allowed edge
   half of ADR-029.

## Verify

- Unit: `ServingFallClassifier.predict_proba` POSTs `{window}`, parses
  `fall_probability`, raises on HTTP error. (stdlib `unittest`, monkeypatched
  `urlopen` — no network.)
- Integration smoke: against running serving (`/health` 200), one window POST
  returns a probability.
- `uv run --directory ml pytest`, `pnpm lint`.

## Distill

If accepted, the serving-owns-the-decision + window-egress seam is already
covered by ADR-029 (deployment topology) and ADR-048 (/predict window contract);
no new ADR — this is implementation of those decisions.
