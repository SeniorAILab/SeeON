# Phase-3 Step 1 — Statistical grounding of the LE2I leaderboard top

Plan: `docs/exec-plan/active/fall-loop-phase3-linear-calibration/` Step 1.
Inputs: frozen LE2I test split (1400 windows / 28 positive / 8 fall events,
eval_split_hash 532e47af…), snapshot artifacts logreg-C1000 + svm-C16
(/tmp/nh-eval-base, wave-7 state), logreg-C29 refit in-memory (same seed/split
as exp-015). Bootstrap: 10,000 resamples. Raw numbers in the four sibling JSONs.

## 1a — Bootstrap CIs (the adoption-pivot numbers)

| Comparison | 95% CI | median | P(Δ≤0) | Verdict |
|---|---|---|---|---|
| Δ P@R90, logreg-C1000 − svm-C16 | [−0.068, +0.117] | +0.026 | **27.4%** | **Statistical tie.** A 27% chance svm is actually ahead — the leaderboard #1 vs #2 ordering carries no evidential weight |
| Δ AUC-PR, logreg-C29 − logreg-C1000 | [+0.105, +0.327] | +0.213 | **0.04%** | **Real.** C29's curve-quality superiority is statistically solid — the C-inversion is not noise |

## 1b — Operating-point bandwidth

Many thresholds satisfy recall≥0.90 (n_valid_ops ≈ 1273), but logreg-C1000's
*maximum-precision* operating point sits at the extreme top of its probability
range (threshold 0.9827 of a [≈0, 0.983] span) — the 0.4483 figure lives on the
last threshold step. svm's optimum (0.285) is interior. Deployment-fragility
concern for C1000 stands.

## 1c — Event-level metrics (the over-specification finding)

At their R90 operating points **all three models catch 8/8 fall events** in the
test split. Window-level P@R90 differences are therefore entirely about
**false-positive window counts**: logreg-C1000 32 FP · svm-C16 34 FP ·
logreg-C29 59 FP. The window-level R90 constraint over-specifies event recall
on LE2I — corroborated independently by the NH side, where event-level catching
is exactly what the gate measures and where the LE2I ranking inverted.

## 1d — Recall-band scan

| Model | P@R85 | P@R88 | P@R90 | P@R92 | P@R95 |
|---|---|---|---|---|---|
| logreg-C1000 | 0.4483 | 0.4483 | 0.4483 | 0.4483 | 0.2571 |
| svm-C16 | 0.4333 | 0.4333 | 0.4333 | 0.4333 | 0.1627 |
| logreg-C29 | 0.4444 | 0.4167 | 0.3059 | 0.3059 | 0.1364 |

Both leaders are flat across R85–R92 (the same op point covers the band) and
collapse at R95. Nothing to gain from relaxing R90→R85; R95 is expensive.

## Implications for adoption

1. LE2I P@R90 cannot separate logreg-C1000 from svm — **the NH gate is the
   deciding axis** (and there svm shows a capability ceiling of 10/19 vs
   logreg's 17/19 in the threshold sweep).
2. C1000 vs C29 is a genuine tradeoff (operating point vs curve quality), now
   statistically grounded. The Step-3 StandardScaler experiment tests whether
   the tradeoff is a scale artifact that normalization dissolves.
3. Since all models catch 8/8 LE2I events, future evaluator hardening should
   report event-level metrics alongside window-level (phase-4 candidate).
