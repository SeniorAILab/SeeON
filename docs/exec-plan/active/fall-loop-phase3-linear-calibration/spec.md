---
slug: fall-loop-phase3-linear-calibration
title: "Fall Loop Phase 3 — Linear-Axis Analysis & Calibration"
type: spec
date: 2026-06-11
owner: gobeumsu
issue: 74
status: active
---

# Spec: Fall Loop Phase 3 — Linear-Axis Analysis & Calibration

## Why this slug exists

1. **Scope formalization (governance)**: the `fall-autoresearch-loop` plan body bounds the
   loop to five model families. A sixth family (`logistic-regression`) was added mid-loop
   (commit 8dbadaf) as an A-axis hypothesis; the 64-agent ultracode review flagged the
   missing plan coverage. Per user decision (2026-06-11, option a), this slug retroactively
   documents that extension and carries all phase-3 work forward. The original plan stays
   `active` for loop operations (harness, gates, journal conventions); it is NOT superseded.
2. **Phase-3 scope**: phase 1–2 exhausted the existing HP search axes. Two structural
   findings now dominate the adoption decision and need dedicated work:
   - **Scale contamination hypothesis**: features are unscaled; logreg C=1000 shows
     probability compression (operating threshold 0.983) and an AUC-PR collapse
     (0.628 @ C=29 → 0.418 @ C=1000).
   - **NH threshold-transfer failure**: LE2I-calibrated operating points catch only
     4–8 of 19 confirmed NH falls, but the max-prob sweep shows capability ceilings of
     17/19 (logreg @ th 0.05), 16/19 (rf), 10/19 (svm) — mostly an operating-point
     problem, partially a representation gap (svm).

## Requirements

- R1: Statistical grounding of the LE2I top-2 tie (bootstrap CI over the 28-positive test
  split) and of the logreg C-inversion (AUC-PR vs P@R90).
- R2: Operating-point bandwidth audit — is P@R90 0.4483 a one-threshold-step knife edge?
- R3: Event-level (per-fall) metrics alongside window-level, LE2I test split.
- R4: Recall-band scan (P@R85/88/92/95) for the human R90-tradeoff decision.
- R5: StandardScaler pipeline variants for the linear families; re-run C sweeps scaled.
- R6: Isotonic calibration of the scaled C-best logreg (CalibratedClassifierCV, prefit).
- R7: NH operating-point policy: quantify catchable falls vs threshold per family; the
  `nh_reference_mask.json` freeze proposal must state which threshold policy it encodes.
- R8: All analysis outputs land in `ml/experiments/analysis/` (text/JSON/MD only) and the
  journal; no media, no `ml/data` writes, privacy chain untouched.

## Non-goals

- New datasets, new feature extraction code (phase-4 candidates: acceleration/torso-angle
  features, stride-1 windowing, k-fold split redesign).
- Changing ADR-017 adoption criteria (any such change is a new ADR, human-approved).
- Auto-confirming gold rows or auto-freezing the NH mask (human gates unchanged).

## Constraints

- Training experiments run ONLY when the phase-2 queue is idle (artifact-store races).
- LE2I eval-split hash must remain 532e47af… for comparability with exp-003…033.
- Repo stays private (user decision 2026-06-11) — facility names in CSVs stay as-is.
