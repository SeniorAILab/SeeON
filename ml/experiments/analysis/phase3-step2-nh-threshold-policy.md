# Phase-3 Step 2 — NH operating-point policy analysis

Plan: `fall-loop-phase3-linear-calibration` Step 2. Gold: `a937797` (19 confirmed,
human-reviewed). Raw data: sibling JSON. FP side measured on the 4 confirmed
no-fall videos — 9,158 non-zero deployment-equivalent windows (multi-person
tracks, tracker noise included). Transformer/gcn rows pending their best-restore
after the phase-2 queue.

## The decision surface (catch vs false-positive rate)

| Operating point | Falls caught /19 | FP windows (rate) | Character |
|---|---|---|---|
| logreg @ 0.10 | **17** | 886 (9.7%) | recall-first; only the 2 never-catchable falls missed |
| rf @ 0.20 | 15 | 586 (6.4%) | balanced |
| logreg @ 0.20 | 13 | 561 (6.1%) | dominated by rf@0.20 (same FP, fewer catches) |
| rf @ 0.30 | 11 | 285 (3.1%) | precision-lean |
| rf @ 0.392 (its LE2I op) | 9 | 110 (1.2%) | precision-first |
| logreg @ 0.983 (its LE2I op) | 6 | 125 (1.4%) | current state — indefensible (worst of both vs rf@0.392) |
| svm @ any | ≤11 even at 0.05 | — | **capability-capped; removed from adoption candidates** |

Notes: FP-rate is a per-window alarm proxy, not a per-hour rate; deployment
would add event aggregation/debounce (phase-4). rf's FP curve has the steepest
useful cliff (0.02% at 0.9); logreg never goes below 1.36% even at 0.983 and
fires in all 4 no-fall videos at every threshold.

## Findings

1. **LE2I-calibrated thresholds are invalid on NH.** logreg's LE2I op (0.983)
   catches 6/19 while its capability ceiling is 17/19 at th 0.10 — the gap is
   threshold transfer, not representation (scale-contamination hypothesis
   consistent; Step 3 tests it causally).
2. **svm is out.** Even at th 0.05 it sees only 11/19 (max-prob ceiling), with
   no FP advantage at usable points. The LE2I statistical tie (Step 1) is
   broken by the NH axis, exactly as the gate design intended.
3. **rf is the current frontier surprise.** LE2I-worst (0.131 P@R90) but
   NH-strongest at its own op (9/19 @ 1.2% FP) and on the balanced point
   (15/19 @ 6.4%). Tree splits appear more robust to the NH distribution shift
   than unscaled-linear probability geometry.
4. **Never-catchable set (all families, th 0.05): 2 falls.**
   - `2026-01-09 202호` — the label the human is still unsure about
     (fall-vs-intentional-sit). Model evidence (all max-probs < 0.05)
     corroborates the doubt. If relabeled no-fall, ceilings become 17/18, 16/18.
   - `2026-05-15 206호` — genuine hard case (0.7 s collapse beside headboard;
     rf max-prob 0.033). Primary target for phase-4 feature work.

## Recommended policy (for the mask-freeze human gate)

1. **Do not freeze the mask at LE2I operating points.** It would enshrine
   logreg@0.983's 6/19 as the protected baseline — a weak ratchet that lets
   future regressions hide behind it.
2. **Freeze AFTER Step 3/4** (scaler + calibration): those experiments shift
   probability geometry wholesale; any threshold chosen now goes stale within
   the week. The corrected-gold catch/FP curves here are the reference frame
   for judging them.
3. **The eventual freeze should encode a human-chosen point on the frontier
   above** (miss-cost vs alarm-fatigue is a clinical/operational judgment, not
   a statistical one). Candidates: logreg@0.10-class (recall-first) or
   rf@0.20-class (balanced), re-derived on the Step-3/4 winners.
4. Mask schema stays `{model_key: [fall_id…]}`; the freeze commit must cite
   this document and state the chosen threshold policy explicitly.
