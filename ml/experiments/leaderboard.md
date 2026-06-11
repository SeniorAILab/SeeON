# Fall-Detector Leaderboard

> Primary metric: **P@R90** (window-level precision at fall-recall ≥ 0.90).
> Hard gates: `recall_90_achieved=True` AND `inference_latency_ms ≤ 167 ms`.
> NH gate: regression veto only — does not change score, but blocks adoption.
> Rows with score = 0.0 failed at least one hard gate (see gate columns).

Last updated: 2026-06-11 (wave 1 — first HP-wired Optuna runs, 5 trials/family; NH gate un-armed pending gold confirm, adoption provisional)

---

## Per-family best

Rows show the **best-scoring** experiment ID per model family.
Gate columns show outcome of the final artifact.

| Rank | Family | Experiment ID | P@R90 | Recall | F1 | Latency (ms) | Params | R90 gate | Latency gate | NH gate | Weights |
|------|--------|--------------|-------|--------|----|-------------|--------|----------|-------------|---------|---------|
| 1 | svm | exp-004-svm-hpsearch | **0.4262** | 0.9286 | 0.5532 | 0.1 | 1362 SV | ✓ | ✓ | un-armed | ml/models/fall/svm |
| 2 | gcn | exp-007-gcn-hpsearch | 0.1486 | 0.9286 | 0.2562 | 1.8 | 201,526 | ✓ | ✓ | un-armed | ml/models/fall/gcn |
| 3 | random-forest | exp-003-rf-hpsearch | 0.1275 | 0.9286 | 0.2243 | 44.3 | 14,979 nodes | ✓ | ✓ | un-armed | ml/models/fall/random-forest |
| 4 | transformer | exp-006-transformer-hpsearch | 0.1268 | 0.9286 | 0.2231 | 0.3 | 28,674 | ✓ | ✓ | un-armed | ml/models/fall/transformer |
| 5 | lstm | exp-005-lstm-hpsearch | 0.0977 | 0.9286 | 0.1773 | 1.5 | 295,802 | ✓ | ✓ | un-armed | ml/models/fall/lstm |

AUC-PR (wave 1): svm 0.6195 · gcn 0.5673 · transformer 0.4852 · rf 0.4310 · lstm 0.1842
(Test split: 1400 windows, 28 positive — small positive count; P@R90 deltas under ~0.02 are noise.
SVM's 0.114 → 0.426 jump is far outside the noise band and is corroborated by the AUC-PR lead.)

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
