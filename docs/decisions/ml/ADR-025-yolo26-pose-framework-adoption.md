# ADR-025: YOLO26-Pose Framework Adoption for Fall-Detection Pose Capture

## Status

Accepted. Supersedes the pose-framework adoption clauses of [ADR-005](./ADR-005-yolo26-pose-and-module-seam.md). ADR-005 remains as the preserved historical source record for the full original investigation and verification detail.

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

Rejected. ADR-005's controls showed the upstream bbox classifiers reproduced their home-domain behavior but collapsed on nursing-home CCTV. The failure is method-level: RGB/bbox appearance is brittle to viewpoint, occlusion, and temporal-event requirements.

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

## Source preservation

This ADR distills the framework adoption decision from ADR-005. ADR-005's original context, verification table, roadmap, alternatives, and consequences remain preserved in the historical source ADR.
