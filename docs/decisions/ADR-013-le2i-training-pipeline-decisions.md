# ADR-013: Le2i Training-Pipeline Decisions — Dataset Detail, Window Labelling, Recall-First Threshold, Gold-Clip Evaluation

## Status

Accepted.

## Date

2026-06-10

## Context

**The strategy decision was already made in ADR-009** and is not reopened here:
bbox-geometry rule-based classification is rejected, Track 2b (public *video*
fall datasets → temporal model over pose keypoints → evaluate on the gold
clips) is the chosen path, and gold-8 with the rule-based 0/8 floor is the
locked comparison baseline. This ADR records the **implementation-level
decisions** made while executing Track 2b (#40) that future training work must
either follow or explicitly supersede: *which* dataset, *how* windows are
labelled, *how* the operating threshold is chosen and shipped, and *how* models
are compared against the gold clips.

MECE boundary: ADR-003 owns artifact layout, ADR-005 owns the pose backbone,
ADR-009 owns the strategy and the gold baseline, ADR-012 owns data location.
This ADR owns only the four contract decisions below.

## Decision

### 1. Dataset: Le2i Fall Detection Dataset (UP-Fall rejected)

Le2i (Charfi et al., 2013): RGB `.avi`, single person per scene, **per-video
annotation files giving the fall frame interval directly** — labels map to
frames with no activity-class scheme and no timestamp conversion. 130 usable
clips (96 fall / 34 ADL).

**UP-Fall rejected** for this PoC: its Activity-11 "Lying" class collides with
fall labels when only pose windows are observed (a person lying down is
indistinguishable from a fallen person without the transition); acquisition is
gated behind a manual per-user download; its labelling is
activity/timestamp-centric, requiring a lossy conversion to frame intervals.

### 2. Window labelling and split

- Sliding windows of **T = 30 frames, stride = 5**.
- A window is positive **iff |window ∩ fall_interval| / T ≥ 0.5**
  (`OVERLAP_THRESHOLD`).
- Le2i annotations are **1-based inclusive** frame numbers; they map to
  0-based half-open intervals as `[f_start − 1, f_end)`. (An off-by-one here
  silently shifts every label — it was a real review finding, hence recorded.)
- Split is **clip-wise** (`TEST_SPLIT_FRACTION = 0.25`, deterministic over
  sorted clip ids) with an assert that train/test clip-id sets are disjoint on
  *every* dataset view — Le2i has no subject IDs, so clip identity is the
  leakage boundary.

**Rejected:** per-frame labelling (discards the temporal context that motivates
Track 2b; noisy at fall boundaries) and any-overlap window labelling (extreme
label noise — a 1-frame graze would count as a fall).

### 3. Recall-first operating threshold, shipped via `metadata.json`

`evaluate.py` selects the operating threshold as the point achieving
**Recall ≥ 0.90** on held-out test windows and **persists it into the
artifact's `metadata.json`** (`operating_threshold`); the live demo adapter
reads it back rather than guessing. Rationale: in eldercare fall detection a
missed fall is the expensive error; precision is secondary at PoC. The
F1-optimal threshold is computed and reported for reference but is **not** the
shipped default.

`metadata.json` is the train↔serve contract (window, stride, threshold,
shapes); readers tolerate schema skew (unknown keys dropped, missing keys
defaulted) so a metadata evolution never crashes the live demo.

### 4. Gold-clip secondary evaluation

Beyond held-out Le2i windows, every trained model is evaluated against the
**nursing-home gold clips** (ADR-009's locked baseline): a clip is predicted
*fall* iff the fraction of positive windows ≥ 0.5
(`GOLD8_POS_WINDOW_FRACTION`), per-clip results (including `no_person_frac`,
per ADR-005's honesty rule) are written to a CSV under `ml/data/eval/`, and the
report states the rule-based floor (0/8) alongside. This is the
domain-transfer check: Le2i is side-view footage, the nursing-home cameras are
top-down — Le2i metrics alone must never gate a model.

## Alternatives Considered

(Per-decision rejections are recorded inline above; the cross-cutting one:)

### Tune until the numbers look good before recording

**Rejected.** The PoC records honest numbers — including the transformer's
training collapse (train F1 = 0.0 on Le2i) — because the decision pipeline
(research → ADR → plan) depends on findings being trustworthy. Tuning is
future work, gated on these recorded baselines.

## Consequences

**Positive:**

- Future training work has a fixed, named contract: window geometry, label
  semantics, threshold policy, and the gold-clip comparison are decided once.
- The train↔serve seam is a file (`metadata.json`), not tribal knowledge.
- Domain mismatch (side-view Le2i vs top-down CCTV) is acknowledged
  structurally via the mandatory gold-clip pass.

**Negative / Trade-offs:**

- Recall-first thresholds run hot: at Recall ≥ 0.90 on Le2i, demo false
  positives are expected (rf operating threshold 0.09). Accepted — the demo's
  purpose is observing model behaviour, not alarm quality.
- Le2i's small positive test count (28 positive windows) makes test metrics
  noisy; conclusions stronger than "RF is currently best, transformer
  collapsed" are not supported.
- T/stride/overlap are locked by this contract; changing them invalidates all
  trained artifacts and requires a superseding ADR (or an explicit new
  version under ADR-003 addressing).

Operational parameters and runnable procedures live in
[`docs/rules/ml-training.md`](../rules/ml-training.md); this ADR records only
the decisions and their rationale.
