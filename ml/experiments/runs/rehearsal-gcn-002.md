# rehearsal-gcn-002

## Hypothesis
Rehearsal: validate the harness end-to-end on a sequence-mode family
(ST-GCN, no architectural change). Pipeline-mechanics check — companion to
rehearsal-rf-001 covering the torch/sequence path.

## Changes
None (default GCN config; Optuna n_trials=2; HP plumbing not yet consumed by
training subprocesses).

## Results
- score (P@R90): **0.1244** vs baseline-0 0.1320 — small delta from subprocess
  retraining nondeterminism (torch ops); within the ±0.02 noise band noted on
  the leaderboard (28 positive test windows)
- recall_90_achieved: True (recall 0.9286, threshold 0.0262)
- inference_latency_ms: **0.67** → latency gate ✓ by huge margin
- params_count: 78914; auc_pr 0.5251
- nh_gate: un-armed (no confirmed gold rows — correct pre-confirmation behavior)

## Adoption decision
N/A (rehearsal). Sequence-mode path verdict: torch subprocess training, model.pt
artifact round-trip, latency benchmark, and run-JSON write all functioned.
Harness is cleared for the first unattended run once the two human gates
(gold confirm, mask freeze) close.
