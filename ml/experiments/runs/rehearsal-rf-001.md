# rehearsal-rf-001

## Hypothesis
Rehearsal: validate the harness end-to-end on a features-mode family
(random-forest, no architectural change). Not a research hypothesis —
a pipeline-mechanics check before the first unattended run.

## Changes
None (default RF config; Optuna n_trials=2, HP plumbing not yet consumed by
training subprocesses — all trials train the default config by design).

## Results
- score (P@R90): **0.1032** — matches baseline-0 exactly (expected: same config, seed 42)
- recall_90_achieved: True (recall 0.9286, threshold 0.09)
- inference_latency_ms: **87.8** → latency gate ✓ (≤ 167 ms)
- params_count: 50498; eval_split_hash: 532e47af…4fbe7e
- nh_gate: un-armed — `No confirmed rows found in nursing-home-gold.csv`
  (correct pre-confirmation behavior: permissive + loud error string)

## Adoption decision
N/A (rehearsal — identical to baseline, nothing to adopt). Pipeline verdict:
config parse → Optuna loop → subprocess train → evaluate → NH gate path →
atomic run-JSON write → loop_status heartbeat all functioned. One operational
fix discovered: harness must be invoked as `python -m experiments.harness`
from `ml/` (script-path execution breaks `training` imports) — skill doc
corrected in e6c1a11.
