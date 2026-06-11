---
slug: fall-loop-phase3-linear-calibration
title: "Fall Loop Phase 3 — Linear-Axis Analysis & Calibration — Execution Plan"
type: plan
date: 2026-06-11
owner: gobeumsu
issue: 74
created-from-spec: fall-loop-phase3-linear-calibration/spec.md
status: active
---
<!-- NOTE: plan body is immutable after finalize (first commit including this file).
     Scope change -> new slug + status: superseded-by. -->

# Plan: Fall Loop Phase 3 — Linear-Axis Analysis & Calibration

## Step 0 — Retro-documentation (done at finalize)
The `logistic-regression` family (factory `ml/training/models/logreg.py`, REGISTRY entry,
SEARCH_SPACES C-space) added in commit 8dbadaf is hereby covered by an exec-plan entry.
The five-family bound in `fall-autoresearch-loop/plan.md` remains historically accurate
for phases 1–2 of that plan; family extensions from here on cite this slug.

## Step 1 — Zero-training analyses (run anytime; artifacts from snapshots)
Scripts are throwaway (/tmp); committed outputs go to `ml/experiments/analysis/`.
1a. Bootstrap CI (≥10k resamples over test windows): P@R90 for logreg-C1000 vs svm-C16
    (is Δ0.015 inside the 95% CI?) and AUC-PR for logreg-C29 vs C1000.
1b. Operating-point bandwidth: count distinct thresholds satisfying recall≥0.90
    (n_valid_ops) per top artifact; report precision across that band.
1c. Event-level metrics: per-fall-event recall/precision on the LE2I test split.
1d. Recall-band scan: precision at R85/R88/R92/R95 for logreg-C1000, logreg-C29, svm-C16.
Output: `ml/experiments/analysis/phase3-step1-{bootstrap,bandwidth,events,recallband}.json`
plus one summary MD.

## Step 2 — NH operating-point policy analysis (no training)
Formalize the threshold sweep (already executed for svm/logreg/rf; extend to
transformer/gcn after their best-restore): per-family catchable-falls-vs-threshold
curves, intersection of never-catchable falls, and a recommended NH threshold policy.
Output: `ml/experiments/analysis/phase3-step2-nh-threshold-policy.{json,md}`.
The `nh_reference_mask.json` freeze proposal (separate commit, human-approved) must
reference this document and state the encoded policy explicitly.

## Step 3 — StandardScaler pipeline experiments (queue must be idle)
Implementation: `scaled` constructor kwarg on the two linear factories (env override
`HARNESS_HP_SCALED`), wrapping the sklearn estimator in
`Pipeline([("scaler", StandardScaler()), ("clf", <estimator>)])`. Persisted via the
existing joblib path (Pipeline is joblib-serializable; no metadata schema change).
Experiments: logreg scaled 8-trial C sweep; svm linear scaled 8-trial C sweep.
Decision rule: if the C-inversion resolves (P@R90-best C ≈ AUC-PR-best C), the scaled
baseline becomes the phase-3 reference and unscaled results are annotated as
scale-contaminated. Tests: env consumption + scaled round-trip + default-off identity.

## Step 4 — Isotonic calibration (after Step 3)
CalibratedClassifierCV(method="isotonic", cv="prefit") on the scaled C-best logreg.
Pass criterion: AUC-PR recovers ≥0.55 while recall_90 holds and the R90 threshold moves
off the 0.98+ knife edge. Fail → logreg-C29-class artifact becomes the deployment
candidate despite nominal P@R90 deficit (Step 1a CI will have grounded this).

## Step 5 — NH re-eval + mask freeze proposal (human gate 2)
Re-run the NH batch eval on the Step-3/4 winners + restored transformer/gcn bests;
draft `nh_reference_mask.json` + policy note; separate commit; request human approval.
No adoption is final until the human approves the freeze (ADR-017 unchanged).

## Acceptance
- Step-1/2 JSON+MD committed; claims in leaderboard/PR cite them.
- Step-3 experiments journaled via the standard harness (run JSONs, leaderboard rows).
- Mask proposal explicitly states its threshold policy and is human-approved before arming.
