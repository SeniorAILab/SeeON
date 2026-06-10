# Fall-Detector Leaderboard

> Primary metric: **P@R90** (window-level precision at fall-recall ≥ 0.90).
> Hard gates: `recall_90_achieved=True` AND `inference_latency_ms ≤ 167 ms`.
> NH gate: regression veto only — does not change score, but blocks adoption.
> Rows with score = 0.0 failed at least one hard gate (see gate columns).

Last updated: 2026-06-11 (5-family baselines trained/evaluated on full LE2I — pre-loop reference points; latency & NH gate pending first harness runs)

---

## Per-family best

Rows show the **best-scoring** experiment ID per model family.
Gate columns show outcome of the final artifact.

| Rank | Family | Experiment ID | P@R90 | Recall | F1 | Latency (ms) | Params | R90 gate | Latency gate | NH gate | Weights |
|------|--------|--------------|-------|--------|----|-------------|--------|----------|-------------|---------|---------|
| 1 | gcn | baseline-0 | 0.1320 | 0.9286 | 0.2311 | — | — | ✓ | — | — | ml/models/fall/gcn |
| 2 | svm | baseline-0 | 0.1140 | 0.9286 | 0.2031 | — | — | ✓ | — | — | ml/models/fall/svm |
| 3 | random-forest | baseline-0 | 0.1032 | 0.9286 | 0.1857 | — | — | ✓ | — | — | ml/models/fall/random-forest |
| 4 | transformer | baseline-0 | 0.0609 | 0.9286 | 0.1143 | — | — | ✓ | — | — | ml/models/fall/transformer |
| 5 | lstm | baseline-0 | 0.0463 | 0.9286 | 0.0883 | — | — | ✓ | — | — | ml/models/fall/lstm |

AUC-PR reference: gcn 0.5881 · lstm 0.3867 · random-forest 0.3682 · transformer 0.3535 · svm 0.2218
(Test split: 1400 windows, 28 positive — small positive count; P@R90 deltas under ~0.02 are noise.)

---

## All experiments (chronological)

| Date | Experiment ID | Family | P@R90 | Recall | F1 | Latency (ms) | R90 gate | Latency gate | NH gate | Notes |
|------|--------------|--------|-------|--------|----|-------------|----------|-------------|---------|-------|
| 2026-06-11 | baseline-0 | all 5 | see above | 0.9286 | — | — | ✓ | — | — | Pre-loop full-data baselines (seed 42, window 30/stride 5); thresholds written to metadata |
| 2026-06-11 | rehearsal-rf-001 | random-forest | 0.1032 | 0.9286 | 0.1857 | 87.8 | ✓ | ✓ | un-armed | Harness rehearsal (features path) — matches baseline exactly |
| 2026-06-11 | rehearsal-gcn-002 | gcn | 0.1244 | 0.9286 | 0.2194 | 0.7 | ✓ | ✓ | un-armed | Harness rehearsal (sequence path) — Δ vs baseline within noise band |

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
