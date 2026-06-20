# ADR-048: ML/backend window predict contract

## Status

Accepted. Extends ADR-023 by fixing the concrete `/debug/predict/window` request/response contract and retaining backend product-policy ownership. The bare `/predict` route was removed in the ml/ edge-device relayout (issue #268); `/debug/predict/window` is the canonical route (`/debug/predict/source` covers bounded source/upload debug mode).

## Date

2026-06-18

## Context

ADR-023 establishes the ownership boundary: ML predicts, while backend owns alert policy, persistence, deduplication, rate limiting, delivery, and product side effects. The refactor needs the concrete serving contract to be equally explicit so backend and ML do not drift on request geometry or response fields.

G-R1 geometry verification confirmed R1-A: the request window is a temporal COCO-17 pose tensor flattened per frame, with shape `[T][51]`. Each frame contains 17 keypoints and each keypoint contributes `[x, y, conf]`; coordinates are normalized like training via `normalize_person_keypoints`, and `conf` is in `[0, 1]`. ML reshapes `[T,51]` to `[T,17,3]`, applies the ML-owned L0 window feature kernel (`features.window_features.extract_window_features`), and classifies the resulting 45-dimensional feature vector with the fall runner (`runners.sklearn_fall`; the legacy `serving.model.FallDetector` symbol remains a compatibility shim). Post-relayout the feature kernel and pose normalization are L0 (`features/`), not the retired `ml/training/data/features` path (issue #268).

The retained backend prediction seam owner is D2-O1: `AlertsModule`, `prediction.port.ts`, and `ml-serving-prediction.adapter.ts`. That seam remains the future extension point for backend consumption of ML predictions.

## Decision

The backend sends a pose window to ML serving `POST /debug/predict/window`; ML returns model prediction fields; backend applies product policy. The window payload and response contract are unchanged from the original `/predict` route.

Request contract:

- Body contains `window`.
- `window` shape is `[T][51]`, where `T` is the serving window length.
- Each row represents 17 COCO-17 keypoints flattened as `[x, y, conf]` triples.
- Coordinates are normalized using the same person-keypoint normalization as training.
- Confidence values are numeric and constrained to `[0, 1]`.

ML serving behavior:

- Reshape `[T,51]` to `[T,17,3]`.
- Convert the pose window to features through the ML-owned L0 window feature kernel `features.window_features.extract_window_features`.
- Feed the 45-dimensional feature vector to the fall runner (`runners.sklearn_fall`; `serving.model.FallDetector` is a compatibility shim).
- Return at least `fall_probability`, `operating_threshold`, and `is_fall`.

Response contract:

```json
{
  "fall_probability": 0.0,
  "operating_threshold": 0.0,
  "is_fall": false
}
```

Backend behavior:

- `AlertsModule` consumes predictions through the `prediction.port.ts` seam and the `ml-serving-prediction.adapter.ts` implementation.
- Backend may ignore ML response fields outside the documented contract.
- Backend owns policy decisions and side effects after receiving the ML signal, consistent with ADR-023.

## Alternatives Considered

### Have ML return a product alert command

- Pros: fewer backend policy steps after prediction.
- Cons: violates ADR-023 by moving product alert decisions and side effects toward ML.
- Rejected: ML predicts; backend decides and acts.

### Send precomputed 45-dimensional features from backend

- Pros: smaller payload to ML serving.
- Cons: duplicates ML training feature knowledge in the TypeScript backend and makes feature evolution cross-runtime brittle.
- Rejected: ML owns feature extraction from the pose window.

### Leave request geometry implicit in code

- Pros: avoids documentation churn.
- Cons: lets backend and ML pass tests against different tensor assumptions until runtime integration fails.
- Rejected: the tensor contract is cross-domain and expensive to debug after drift.

## Consequences

- ADR-023 remains the ownership authority; this ADR extends it with the concrete window prediction contract.
- Backend alert policy, persistence, deduplication, and delivery do not move into ML serving.
- ML serving can refactor internal model implementation only if the documented request and response contract remains compatible or a successor ADR is written.
- Backend changes to the prediction seam must preserve `AlertsModule` + `prediction.port.ts` + `ml-serving-prediction.adapter.ts` as the retained owner unless a future ADR changes that seam.
- Contract tests should cover geometry `[T][51]`, response fields, and backend handling of extra ML response fields.
