# Fall-Detector Leaderboard

> Primary metric: **P@R90** (window-level precision at fall-recall ≥ 0.90).
> Hard gates: `recall_90_achieved=True` AND `inference_latency_ms ≤ 167 ms`.
> NH gate: regression veto only — does not change score, but blocks adoption.
> Rows with score = 0.0 failed at least one hard gate (see gate columns).

Last updated: 2026-06-11 (wave 7 — per-family-best canonical artifacts restored and verified by exact score reproduction (deterministic pipeline, seed 42). Loop idle: LE2I search axes exhausted; awaiting gold confirm → NH batch evaluation → mask freeze)

---

## Per-family best

Rows show the **best-scoring** experiment ID per model family.
Gate columns show outcome of the final artifact.

| Rank | Family | Experiment ID | P@R90 | Recall | F1 | Latency (ms) | Params | R90 gate | Latency gate | NH gate | Weights |
|------|--------|--------------|-------|--------|----|-------------|--------|----------|-------------|---------|---------|
| 1 | logistic-regression | exp-017-logreg-c1000-probe | **0.4483** | 0.9286 | 0.6047 | 0.04 | 46 | ✓ | ✓ | un-armed | ml/models/fall/logistic-regression — statistical tie with svm (Δ0.015 < noise); AUC-PR tradeoff noted. ⚠ C=1000 came from a manual hp_override probe OUTSIDE the then-current Optuna space (cap was 100); space since extended so the region is autonomously discoverable |
| 2 | svm | exp-008-svm-linear-refine | 0.4333 | 0.9286 | 0.5909 | 0.1 | — | ✓ | ✓ | un-armed | ml/models/fall/svm |
| 3 | transformer | exp-010-transformer-1layer-refine | 0.2574 | 0.9286 | 0.4031 | 0.3 | — | ✓ | ✓ | un-armed | ml/models/fall/transformer |
| 4 | gcn | exp-009-gcn-blocks3-refine | 0.1871 | 0.9286 | 0.3114 | 2.2 | — | ✓ | ✓ | un-armed | ml/models/fall/gcn |
| 5 | random-forest | exp-011-rf-shallow-refine | 0.1307 | 0.9286 | 0.2291 | 92.9 | — | ✓ | ✓ | un-armed | ml/models/fall/random-forest |
| 6 | lstm | exp-005-lstm-hpsearch | 0.0977 | 0.9286 | 0.1769 | 1.5 | 295,802 | ✓ | ✓ | un-armed | ml/models/fall/lstm — **RETIRED** (wave 3: <0.15 with AUC-PR<0.3 across 10 configs) |

AUC-PR (best per family): **logreg 0.6279 (w4)** · svm 0.6195 (w1) · gcn 0.5673 (w1) · transformer 0.5535 (w2) · rf 0.4310 (w1) · lstm 0.1842 (w1)
(Test split: 1400 windows, 28 positive — small positive count; P@R90 deltas under ~0.02 are noise.
SVM's 0.114 → 0.43 jump is far outside the noise band, corroborated by AUC-PR and reproduced
across waves: linear-kernel trials with C≥5 plateau at 0.39–0.43.)

---

## All experiments (chronological)

| Date | Experiment ID | Family | P@R90 | Recall | F1 | Latency (ms) | R90 gate | Latency gate | NH gate | Notes |
|------|--------------|--------|-------|--------|----|-------------|----------|-------------|---------|-------|
| 2026-06-11 | baseline-0 | all 5 | see above | 0.9286 | — | — | ✓ | — | — | Pre-loop full-data baselines (seed 42, window 30/stride 5); thresholds written to metadata |
| 2026-06-11 | rehearsal-rf-001 | random-forest | 0.1032 | 0.9286 | 0.1857 | 87.8 | ✓ | ✓ | un-armed | Harness rehearsal (features path) — matches baseline exactly |
| 2026-06-11 | rehearsal-gcn-002 | gcn | 0.1244 | 0.9286 | 0.2194 | 0.7 | ✓ | ✓ | un-armed | Harness rehearsal (sequence path) — Δ vs baseline within noise band |
| 2026-06-11 | exp-003-rf-hpsearch | random-forest | 0.1275 | 0.9286 | 0.2243 | 44.3 | ✓ | ✓ | un-armed | Wave 1. Best: n_est=383, depth=5, leaf=10 — strong regularization wins (vs deep-tree hypothesis) |
| 2026-06-11 | exp-004-svm-hpsearch | svm | 0.4262 | 0.9286 | 0.5532 | 0.1 | ✓ | ✓ | un-armed | Wave 1. **Linear kernel C≈6.4 → 3.7× baseline**; both linear trials (0.426/0.400) dominated all rbf trials |
| 2026-06-11 | exp-005-lstm-hpsearch | lstm | 0.0977 | 0.9286 | 0.1773 | 1.5 | ✓ | ✓ | un-armed | Wave 1. Best: hidden=116, layers=3, lr=2.9e-3. 2× baseline but stays floor family; AUC-PR 0.18 worst |
| 2026-06-11 | exp-006-transformer-hpsearch | transformer | 0.1268 | 0.9286 | 0.2231 | 0.3 | ✓ | ✓ | un-armed | Wave 1. Smaller-is-better confirmed: d=64, heads=2, 1 layer, lr=1.3e-4 doubles baseline |
| 2026-06-11 | exp-007-gcn-hpsearch | gcn | 0.1486 | 0.9286 | 0.2562 | 1.8 | ✓ | ✓ | un-armed | Wave 1. Best: hidden=83, blocks=3, lr=1.1e-4, dropout=0.48 — lost family lead to svm |
| 2026-06-11 | exp-008-svm-linear-refine | svm | 0.4333 | 0.9286 | 0.5909 | 0.1 | ✓ | ✓ | un-armed | Wave 2. kernel=linear pinned, C refined → C≈15.7. Plateau confirmed: C≥5 trials 0.39–0.43, low-C trials degrade — wave-1 jump is real |
| 2026-06-11 | exp-009-gcn-blocks3-refine | gcn | 0.1871 | 0.9286 | 0.3114 | 2.2 | ✓ | ✓ | un-armed | Wave 2. blocks=3 pinned → hidden=110, lr=2.7e-4, **dropout=0.09** (wave-1's 0.48 was not the driver) |
| 2026-06-11 | exp-010-transformer-1layer-refine | transformer | 0.2574 | 0.9286 | 0.4031 | 0.3 | ✓ | ✓ | un-armed | Wave 2. layers=1 pinned → d=64, heads=4, lr=1.2e-4 — 2× wave-1, now family rank 2 |
| 2026-06-11 | exp-011-rf-shallow-refine | random-forest | 0.1307 | 0.9286 | 0.2291 | 92.9 | ✓ | ✓ | un-armed | Wave 2. depth=5 pinned — Δ+0.003 vs wave 1 = noise; RF plateaued ~0.13, deprioritize |
| 2026-06-11 | exp-012-transformer-d64-lr-refine | transformer | 0.2524 | 0.9286 | 0.3976 | 0.3 | ✓ | ✓ | un-armed | Wave 3. lr-only search re-found lr=1.3e-4 (same point); 0.2524 vs 0.2574 = noise — lr region saturated |
| 2026-06-11 | exp-013-gcn-lowdrop-refine | gcn | 0.1566 | 0.9286 | 0.2680 | 0.9 | ✓ | ✓ | un-armed | Wave 3. dropout=0.1 pinned underperformed wave 2 (hidden=33 sampled small); 0.1871 stands as family best |
| 2026-06-11 | exp-014-lstm-3layer-lastshot | lstm | 0.0945 | 0.9286 | 0.1721 | 0.8 | ✓ | ✓ | un-armed | Wave 3. Last shot failed the stated bar (<0.15, AUC-PR 0.27) → **family retired from the loop** |
| 2026-06-11 | exp-015-logreg-linear-hypothesis | logistic-regression | 0.3059 | 0.9286 | 0.4602 | 0.04 | ✓ | ✓ | un-armed | Wave 4 A-axis debut. C≈29 → 0.31 with **46 params** and best-overall AUC-PR 0.6279 — linear-separability hypothesis confirmed; trial trend rises toward the C=100 space boundary |
| 2026-06-11 | exp-016-logreg-c300-probe | logistic-regression | 0.4000 | 0.9286 | 0.5591 | 0.04 | ✓ | ✓ | un-armed | Wave 5 boundary probe. C=300 → 0.400 but AUC-PR drops to 0.4446 — operating-point gain trades against curve quality |
| 2026-06-11 | exp-017-logreg-c1000-probe | logistic-regression | 0.4483 | 0.9286 | 0.6047 | 0.04 | ✓ | ✓ | un-armed | Wave 5 boundary probe. C=1000 → **0.4483**, nominal overall lead (tie with svm within noise); AUC-PR 0.4182 keeps degrading — near-unregularized fit favors the R90 point specifically |
| 2026-06-11 | exp-018-logreg-c10000-probe | logistic-regression | 0.2524 | 0.9286 | 0.3969 | 0.04 | ✓ | ✓ | un-armed | Wave 6. C=10000 collapses to 0.2524 — **C curve peaked at ≈1000**; logreg final at 0.4483 |
| 2026-06-11 | exp-019-svm-linear-c300-probe | svm | 0.3662 | 0.9286 | 0.5253 | 0.06 | ✓ | ✓ | un-armed | Wave 6. C=300 degrades vs C=15.7 (0.4333) — svm prefers moderate regularization; **svm final at 0.4333** |
| 2026-06-11 | exp-020…025 (best-restore) | all 5 active | = family bests | 0.9286 | — | — | ✓ | ✓ | un-armed | Wave 7. Per-family-best configs retrained → canonical artifacts now match the leaderboard (exact score reproduction 5/5: 0.4483 / 0.4333 / 0.2574 / 0.1871 / 0.1307; exp-022 used a wrong lr and was corrected by exp-025). Store is NH-batch-eval ready |

---

## Gate legend

| Symbol | Meaning |
|--------|---------|
| ✓ | Gate passed |
| ✗ | Gate failed (score forced to 0.0 for hard gates) |
| — | Gate not evaluated / un-armed |

## Adoption criteria (ADR-017)

A model may be promoted to production when:
1. `recall_90_achieved = True` (P@R90 > 0 on this leaderboard)
2. `inference_latency_ms ≤ 167 ms`
3. `nh_gate.gate_passed = True` (regression veto — must not be worse than `nh_reference_mask.json` baseline)
