# ADR-025: YOLO26-Pose Framework Adoption for Fall-Detection Pose Capture

## Status

Accepted. Owns the YOLO26-pose framework adoption decision; earlier combined-ADR history is recoverable from git.

## Date

2026-06-13

## Context

ADR-005 bundled three active decisions: the pose framework choice, the two-seam module architecture, and the output/baseline policy around model modules. Those decisions can evolve independently. This ADR extracts the active framework choice so the current ADR corpus is MECE.

The project moved away from appearance-based single-frame bbox classifiers after in-domain controls showed they did not transfer to nursing-home CCTV. Fall detection needs pose/keypoint signals that can feed temporal classifiers.

## Decision

Use **Ultralytics YOLO26-pose** as the primary pose/detection framework for the ML fall-detection pipeline.

Rationale preserved from ADR-005:

- Pose keypoints plus temporal windows are a better inductive bias for falls than single-frame RGB/bbox appearance labels.
- YOLO26-pose supports training/fine-tuning, which matters for top-down nursing-home footage and out-of-distribution bedridden/blanket-covered scenes.
- YOLO handles multi-person scenes natively, matching nursing-home CCTV reality better than single-person-first pose stacks.
- Deployment/export paths are mature enough for PoC and future serving work.

The project remains honest about verification: YOLO26-pose was **partially verified** on nursing-home footage. When a person is detected, skeleton quality is good; the hard failure mode is person detection miss for top-down, lying, blanket-covered residents. The improvement path is scale-up measurement followed by domain fine-tuning if misses persist.

## Verification Results (2026-06-08)

The "next experiment" promised by the framework decision was run: **YOLO26-nano pose**
(`yolo26n-pose.pt`) on a representative sample of 6 of the 23 real nursing-home
clips (40 evenly-spaced frames each; GT-free proxies + visual inspection of saved
annotated frames). The remaining 17 clips were not sampled — listed explicitly in
the run log, not silently dropped. Outcome: **partial — the hypothesis holds
conditionally.**

| Clip (scene) | person-detection rate | visible kpts /17 | mean kpt conf |
|---|---|---|---|
| 3F lounge (multi-person, upright) | **100%** | 13.6 | 0.914 |
| Room 206 (ambulatory) | **100%** | 13.5 | 0.894 |
| Room 505 | 72.5% | 14.6 | 0.890 |
| Room 404 (facility-2) | 57.5% | 10.7 | 0.902 |
| Room 301 (large clip) | 51.3% | 11.1 | 0.886 |
| Room 502 (largest/newest, bedridden) | **25%** | 12.2 | 0.896 |

Three findings, stated honestly:

1. **When a person is detected, pose is captured precisely — even at nano scale.**
   Across *all six* clips, every fired frame returns 10–15 of 17 visible keypoints
   at confidence 0.886–0.914. Skeleton quality is uniformly good regardless of
   scene; nano locks the pose tightly once it finds the person.
2. **The failure mode is detection-miss, not bad skeletons.** Upright/seated people
   (lounge, ambulatory patients) → 100% detection. Bedridden patients viewed
   near-vertically from a ceiling camera, often under a blanket → 25–73% detection.
   The model simply does not *find* the person in those frames; it is not that it
   draws a poor skeleton.
3. **Root cause = out-of-distribution, not model capacity.** Ceiling top-down +
   lying + blanket is a pose essentially absent from COCO. This is a *distribution*
   problem, which bounds what scaling alone can fix (see roadmap).

### Improvement roadmap (cheap → fundamental)

1. **Scale up first (cheap, minutes).** `yolo26{n,s,m}-pose.pt` is a one-line weight
   swap through the model-seam — re-measure how far detection rate climbs on the
   same sampled clips. Scaling raises precision/recall **within the training
   distribution** (small, partially-occluded, atypical-but-in-distribution poses),
   so it should recover *some* of nano's misses. Low energy, data-driven check.
2. **Domain fine-tuning (fundamental).** If bedridden top-down misses persist after
   scaling — expected, because **scale does not teach an out-of-distribution pose** —
   the root fix is fine-tuning on labeled nursing-home frames from the ceiling
   viewpoint showing lying / blanket-covered patients. A bigger model sharpens
   in-distribution precision; only new training data adds the missing pose to the
   distribution. This is the line we hold honestly: a larger model will not, on its
   own, learn that "a person is there" in a viewpoint it never saw.
3. **Cost / serving trade-off.** Larger weights raise inference latency and cost,
   weighed against edge / real-time serving constraints (ADR-022 serving/training lifecycle).
   The right size is the smallest that clears the detection bar *after* fine-tuning,
   not the largest available.

## MECE boundary

| Concern | Owning ADR |
|---|---|
| Pose/detection framework choice and domain-fit verification | ADR-025 |
| Frame/model seam architecture | ADR-026 |
| Output-axis semantics, retained bbox baselines, fake-adapter deletion | ADR-027 |
| Classifier strategy over keypoint sequences | ADR-009 |
| Trained model adoption criteria | ADR-017 |

## Alternatives Considered

### Stay on bbox appearance classifiers

Rejected. Retired source ADR-005's controls showed the upstream bbox classifiers reproduced their home-domain behavior but collapsed on nursing-home CCTV. The failure is method-level: RGB/bbox appearance is brittle to viewpoint, occlusion, and temporal-event requirements.

### MediaPipe BlazePose as the primary framework

Deferred rather than forbidden. MediaPipe remains a possible future module behind the seam, but it is weaker for train/fine-tune and multi-person nursing-home adaptation.

### Treat scale-up as proof of domain fit

Rejected. Larger weights may recover in-distribution misses, but only domain data/fine-tuning teaches the top-down bedridden/blanket-covered pose distribution. Scale-up is a measurement step, not proof.

## Consequences

**Positive:**

- The framework direction is explicit and can be referenced without pulling in seam or baseline-policy details.
- Domain-fit caveats are preserved, preventing overclaiming.
- Future model work can distinguish pose-capture quality from fall-classification quality.

**Negative / trade-offs:**

- The framework choice is still conditional on domain fine-tuning for the hardest top-down cases.
- Pose quality lacks keypoint ground truth on nursing-home footage; visual inspection and GT-free proxies remain weaker than OKS labels.

## Source mapping

This ADR distills the framework adoption decision from retired source ADR-005. ADR-005's original context, verification table, roadmap, alternatives, and consequences remain recoverable from git history; ADR-025, ADR-026, and ADR-027 carry the current active clauses so the visible corpus stays MECE.
