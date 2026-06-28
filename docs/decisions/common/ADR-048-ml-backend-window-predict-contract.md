# ADR-048: ML/backend window predict contract

## Status

Retired / removed. This ADR preserves the historical `/debug/predict/window` request/response contract, but the in-api prediction route and backend `MlServingPredictionAdapter` pull seam were removed by ref #431. The live path is worker-produced ML probability pushed as backend Event API `confidence`; the backend pull seam was dormant per ADR-062 before removal.

## Date

2026-06-18

## Context

ADR-023 establishes the ownership boundary: ML predicts, while backend owns alert policy, persistence, deduplication, rate limiting, delivery, and product side effects. The refactor needs the concrete serving contract to be equally explicit so backend and ML do not drift on request geometry or response fields.

G-R1 geometry verification confirmed R1-A: the request window is a temporal COCO-17 pose tensor flattened per frame, with shape `[T][51]`. Each frame contains 17 keypoints and each keypoint contributes `[x, y, conf]`; coordinates are normalized like training via `normalize_person_keypoints`, and `conf` is in `[0, 1]`. ML reshapes `[T,51]` to `[T,17,3]`, applies the ML-owned L0 window feature kernel (`features.window_features.extract_window_features`), and classifies the resulting 45-dimensional feature vector with the fall runner (`runners.sklearn_fall`; the legacy `serving.model.FallDetector` symbol remains a compatibility shim). Post-relayout the feature kernel and pose normalization are L0 (`features/`), not the retired `ml/training/data/features` path (issue #268).

Historical seam owner was D2-O1: `AlertsModule`, `prediction.port.ts`, and `ml-serving-prediction.adapter.ts`. That backend-pull seam was dormant under ADR-062 and has now been removed; the live backend consumes pushed Event API facts instead.

## Decision

Historically, the backend-pull contract sent a pose window to ML serving `POST /debug/predict/window`; ML returned model prediction fields; backend applied product policy. That contract is no longer live: `/debug/predict/window` and `/debug/predict/source` were removed from `ml-api`, and backend no longer pulls predictions through `MlServingPredictionAdapter`. Live classification now happens in `ml-worker`, which relays probability-bearing facts through `ml-api` to the backend Event API as `confidence`.

Request contract:

- Body contains `window`.
- `window` shape is `[T][51]`, where `T` is the serving window length.
- Each row represents 17 COCO-17 keypoints flattened as `[x, y, conf]` triples.
- Coordinates are normalized using the same person-keypoint normalization as training.
- Confidence values are numeric and constrained to `[0, 1]`.

Historical ML serving behavior:

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

Historical backend-pull behavior:

- `AlertsModule` consumed predictions through the `prediction.port.ts` seam and the `ml-serving-prediction.adapter.ts` implementation.
- Backend could ignore ML response fields outside the documented contract.
- Backend owns policy decisions and side effects after receiving the pushed Event API ML signal, consistent with ADR-023.

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
- The historical request/response schema above is preserved for lineage only; it is not a current runtime API.
- `ml-api` must not reintroduce prediction/model-loading routes without a successor ADR.
- Backend consumption of ML output is now through pushed Event API facts with `confidence`, not a backend pull adapter.

## Changelog

- 2026-06-28: Retired ADR-048 as a current contract after ref #431 removed `ml-api` debug prediction routes and the dormant backend `MlServingPredictionAdapter` pull seam; live ML output is worker-produced probability pushed to the backend Event API as `confidence`.
