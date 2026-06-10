# ADR-009: Fall-Classification Strategy — Keypoint-Sequence Temporal Models over Bbox Geometry; Public Datasets First, VLM-Labeling Deferred

## Status

Accepted.

## Date

2026-06-09

## Context

ADR-005 made the model-seam (`ModelModule.predict(frame)→DetectionResult`)
**pluggable** but deliberately left open the question it could not yet answer:
*what classifier fills that seam?* Per-frame RGB classifiers were rejected there
(domain collapse). The v1 demo then shipped a single immediately-available
replacement — a **rule-based bbox-geometry classifier** (`ml/demo/classifiers.py`,
`RuleBasedClassifier`) that calls a frame "down" when
`aspect_ratio ≥ 1.2 ∧ vertical_center ≥ 0.55` and fires a fall when the down
state is sustained ≥ N seconds. Learned classifiers (RF/LSTM/Transformer) were
left as disabled placeholders pending trained artifacts.

That rule-based classifier was then **tested empirically against real
nursing-home top-down footage** — the 8 human-labeled gold-anchor clips
(`docs/exec-plan/archive/pose-classifier-fall-demo/gold-labels.md`), headless,
YOLO26n-pose at conf 0.05, default parameters. **Result: 0/8 PASS — every clip
MISS** (the classifier never fired inside the labeled fall interval).

A feature-distribution diagnostic (before vs after onset on clips 305/502/506호)
showed this is **structural, not a tunable-threshold problem**:

- **`aspect_ratio` never reaches the 1.2 lying threshold even after a fall.**
  Post-onset medians: 305호 0.43, 502호 0.54, 506호 0.85 — all < 1.2. Under a
  ceiling top-down view a fallen person's bbox stays compact/tall, it does **not**
  widen sideways. `aspect_ratio ≥ 1.2` is a **side-view** assumption
  (Le2i/UR-Fall), structurally wrong for top-down.
- **Before/after distributions overlap heavily.** 502호: aspect 0.50→0.54,
  box-height 0.31→0.31, torso 0.10→0.10 — near-identical. Lowering thresholds
  cannot separate fall from non-fall because the bbox-geometry features do not
  separate them.
- **Person detection drops out after a floor-fall.** Post-onset no-person frames:
  305호 113, 506호 53. When a person lies on the floor YOLO-pose frequently loses
  them, which resets the sustained-down timer — so no geometry rule can ever
  accumulate the required N seconds (a detection-layer failure compounding the
  feature failure).

This confirms the research hypothesis (`docs/research/fall-detection-methods.md`,
§1 methodology): single-frame / side-view geometric assumptions do not transfer to
nursing-home top-down CCTV. The decision of *what fills the classifier seam* can
no longer be deferred, and it is **cross-cutting** — it constrains every future
classifier, the data pipeline, and the eval baseline. Hence this ADR.

## Decision

1. **Bbox-geometry rule-based classification is rejected as the production
   approach for top-down CCTV.** It is retained only as (a) the **locked 0/8
   baseline** and (b) a zero-dependency smoke path in the demo. It is not the
   direction.

2. **Feature representation = pose keypoint *sequences* (temporal), not
   single-frame bbox geometry.** The signal is COCO-17 keypoints tracked over a
   time window, not the aspect ratio of one box.

3. **Classifier content = learned temporal models** (LSTM / Transformer / TCN)
   over keypoint windows. This is what fills the ADR-005 model-seam going forward.

4. **Training-data strategy is sequenced — public datasets first, our own
   footage later:**
   - **Track 2b (chosen, do first):** public *video* fall datasets → our
     YOLO26-pose extracts keypoint sequences → train a temporal model →
     **evaluate on gold-8**. Tracked in GitHub issue **#40**.
   - **Track 2c (deferred, not abandoned):** VLM-assisted labeling of our own
     nursing-home footage. Methodology preserved in
     `docs/research/vlm-assisted-dataset-construction.md`; revisited after 2b
     establishes a baseline.

5. **gold-8 is the locked comparison baseline.** Rule-based = 0/8 is the recorded
   floor; every future classifier is measured against gold-8 first.

### MECE boundary (mandatory — ADRs must be MECE)

| Concern | Owning ADR |
|---|---|
| Pose backbone + the pluggable model-seam **contract** | ADR-005 |
| Frame-intake **code location** (`VideoFileSource`) | ADR-006 |
| **What fills the classifier seam** — feature representation, classifier family, training-data strategy, eval baseline | **ADR-009 (this)** |

This ADR does **not** reopen the seam contract or the pose backbone (ADR-005),
nor frame-intake placement (ADR-006). It decides only the *content* flowing
through the already-agreed seam.

## Alternatives Considered

### A. Keep tuning the rule-based thresholds
**Rejected.** The diagnostic proves the failure is structural: post-fall
`aspect_ratio` stays < 1.2 and before/after feature distributions overlap. No
threshold separates the classes; this is not recoverable by tuning.

### B. Hand-engineer top-down-specific geometric features (rule v2 / track 2a)
**Deferred, not chosen as primary.** Shoulder–hip vertical alignment, torso-center
drop velocity, motion→still transition could be hand-coded. But hand-tuned rules
generalize poorly across cameras, and once we are extracting keypoint sequences a
*learned* model dominates a hand-rule for the same input. Kept as a possible cheap
interim, not the strategic direction.

### C. VLM-label our own footage first (track 2c)
**Deferred.** Higher per-clip cost and latency, and it bootstraps from zero
labels. Public datasets give a faster, citable baseline now; VLM-labeling is the
right tool once we know how far public-data transfer gets us.

### D. Per-frame RGB classifier
**Already rejected in ADR-005** (domain collapse). Not reconsidered.

## Consequences

**Positive:**
- The classifier direction is settled and cross-cutting work can proceed in
  parallel (datasets × model variants — a dynamic-workflow fan-out, issue #40).
- A concrete, reproducible baseline (gold-8, rule-based 0/8) anchors all future
  comparison.
- Keypoint sequences reuse the existing YOLO26-pose seam — no new ingestion.

**Negative / Trade-offs:**
- Most public fall datasets are **side-view** — transfer to top-down is itself a
  risk that 2b must measure, not assume.
- **Sensor-only** datasets (SisFall, FallAllD = accelerometer) cannot yield pose
  and are excluded; the usable public corpus is smaller than it first appears.
- Requires training infrastructure investment (windowing, training loop, model
  artifacts under ADR-003) that the rule-based path avoided.

## Relationship to Other ADRs

- **Complements ADR-005; does not supersede it.** ADR-005's seam contract and
  YOLO26-pose backbone stand unchanged. This ADR fills the seam ADR-005 left open.
- **References ADR-003** (serving/training split + version-addressed artifacts) —
  trained temporal models become `ml/artifacts/<name>/<version>/` artifacts.
- **Implementation** is tracked in GitHub issue **#40** (track 2b). This ADR
  records the *decision*; the issue records the *how*.
