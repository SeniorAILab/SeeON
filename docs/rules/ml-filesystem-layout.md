# Rule: `ml/` filesystem layout

> Scope: the `ml/` uv project. A standing convention every change must follow.
> Records the operational "where does this file go" rule; the why lives in
> [ADR-012](../decisions/ml/ADR-012-ml-data-domain-first-layout.md) (data layout)
> and [ADR-015](../decisions/ml/ADR-015-ml-models-single-root.md) (model layout,
> supersedes retired source ADR-003 §3 and ADR-007 rows 1/2/5). Runtime process
> ownership lives in [ADR-067](../decisions/ml/ADR-067-ml-edge-api-worker-service-split.md);
> portable worker video backend policy lives in
> [ADR-068](../decisions/ml/ADR-068-ml-edge-worker-portable-video-runtime.md); edge/central
> state and config-distribution split lives in
> [ADR-074](../decisions/ml/ADR-074-ml-edge-central-state-and-config-distribution.md).

## Edge-device package tree

`ml/` has eight shared production packages plus the `worker/` process, `training/`, and `demo/`:

```text
ml/
├── contracts/   # L0 dataclasses/protocols/constants only
├── features/    # L0 pure geometry/window feature transforms
├── sources/     # L1 frame intake: video files, webcams, RTSP/OpenCV backend seam, registry, probing
├── runners/     # L1 model/runtime adapters: YOLO pose/bed, sklearn fall, device/warmup
├── perception/  # L2 observation construction, tracking, scene state, bed detection, frame features
├── domains/     # L3 domain detectors/latches: fall, bed-exit, long-lie, risk, wheelchair standup
├── events/      # L4 outbound alert/event schemas, signing, publishing, outbox
├── api/         # L5 ml-api gateway: lifespan, routes, debug pipeline, relay-heartbeat /status
└── worker/      # ml-worker process + worker-owned live orchestration/state (camera_worker, supervisor, scheduler, status_store, latest_frame, incident_manager, config)
```

Dependency ladder: lower layers never import higher layers. There is no `runtime`
package — worker-owned live orchestration/state lives in `worker/` (ADR-067).
`api` and `worker` are separate deployable processes with **zero cross-boundary
shared state**; their only connection is one-directional relay HTTP facts
(`worker -> ml-api /relay/*`). `demo/` is a developer harness at L5 and may import
production packages plus training catalog metadata. `training/` may import only
`contracts`, `features`, `sources`, and `runners` from the production tree.
`ml/core/` and `ml/util/` do not exist.

`ml-api` boot is owned by `api.lifespan` as a thin gateway: load config, warm the
debug model/pose runner, build the debug pipeline, configure the backend-ingest
gateway + relay-heartbeat store, resolve the bounded debug source registry, then
expose `/health`, `/status`, `/models`, and `/debug/predict/{window,source}`.
`/status` is derived from the relay-heartbeat store; `ml-api` does not assemble
camera loops. Keep boot-order changes in that module and its tests.

Production RTSP is not an `ml-api` concern. The live path is
`RTSP -> ml-worker -> ml-api -> backend /ingest/*`; `ml-api` remains a
private/local FastAPI health, status, models, debug, and control surface, and is the only backend gateway. The
current RTSP backend is OpenCV. GStreamer, DeepStream, and Triton are future
adapters only and must not be added as production dependencies without a new
decision and release-matrix pinning.

## `ml/data/` — domain-first, two tiers

```text
ml/data/
├── nursing-home/          # domain: privately collected eldercare footage (operator-only)
│   ├── raw/               # originals — never modified in place
│   ├── processed/         # lossless processed clips (gold clips live here)
│   ├── poses/             # extracted keypoint caches (.npz)
│   └── annotated/         # rendered overlay videos
├── le2i/                  # domain: public training dataset
│   └── (same four roles)
├── eval/                  # cross-domain outputs (comparison CSVs/reports)
└── uploads/               # transient demo uploads — the only externally reachable input
```

- Top level = domain (provenance). One folder per data source.
- Role subfolders are a fixed vocabulary: exactly `{raw, processed, poses,
  annotated}`. No prefixes, synonyms, or per-domain inventions.
- `eval/` and `uploads/` are the only top-level non-domain entries.

### Adding a new domain

Create `ml/data/{domain}/` (kebab-case provenance name) with whichever fixed role
folders you need. Point the relevant config constant (`training/config.py`) at it.
Nothing else — no new conventions, no registry.

## Where each file category lives

> Package authority: the edge package layout below is established by
> **ADR-056** (frame intake → `sources/`, `Frame`/`FrameSource` contract → `contracts/`)
> and **ADR-057** (FrameObservation runner contracts, `ModelRegistry`, and the edge
> package tree + dependency ladder + boot order), both under issue #268; they supersede
> the retired `ml/core/` + `ml/util/` layout (ADR-006 frame-intake-in-`ml/util/`).
> **ADR-067** refines this: the `runtime` package is removed and its worker-owned
> orchestration/state moves to `worker/`, with `api` as the thin backend gateway.

| File category | Home | Committed? | ADR |
|---------------|------|-----------|-----|
| Production contracts/protocols | `ml/contracts/` | yes | ADR-057 |
| Pure feature transforms | `ml/features/` | yes | ADR-057 |
| Frame intake and camera probing code | `ml/sources/` | yes | ADR-006/057/068 |
| Runner adapters and hardware/model warmup | `ml/runners/` | yes | ADR-025/057 |
| Perception state/tracking/observation code | `ml/perception/` | yes | ADR-057 |
| Domain detectors and latches | `ml/domains/` | yes | ADR-057 |
| Edge worker orchestration/state (camera workers, supervisor, scheduler, status, latest-frame, incident, config) | `ml/worker/` | yes | ADR-067/068 |
| Event/alert seam | `ml/events/` | yes | ADR-029/057 |
| ml-api gateway + lifespan + debug pipeline + heartbeat status | `ml/api/` | yes | ADR-022/057/067 |
| Trained first-party models (+ `metadata.json`) | `ml/models/fall/<model_type>/` | no (gitignored) | ADR-015 |
| Third-party comparison checkpoints | `ml/models/fall/pretrained/*/` | no (gitignored) | ADR-015 |
| Upstream pose/bed weight cache | `ml/models/{pose,bed}/` | no (gitignored) | ADR-015 |
| Domain-bound data, any role | `ml/data/{domain}/{raw,processed,poses,annotated}` | no (gitignored) | ADR-012 |
| Cross-domain derived outputs | `ml/data/eval/` | no (gitignored) | ADR-012 |
| Transient demo uploads | `ml/data/uploads/` | no (gitignored) | ADR-012 |

## Invariants

- **Weights, footage, and generated outputs are gitignored and NEVER committed
  or pushed.** `ml/data/` and `ml/models/` (the entire tree) are in `.gitignore`.
  Run `git status` before every commit and confirm none are staged.
- **Raw is sacred.** Files under any `{domain}/raw/` are never modified in place;
  processing writes lossless copies to `{domain}/processed/` only.
- **`ml/data/` is partitioned domain-first.** Data goes in `{domain}/{role}/` with
  the fixed role vocabulary above. Cross-domain outputs go in `eval/`; nothing
  else lives at the top level.
- **`nursing-home/` is operator-only.** It must never be listed or served by an
  externally deployed demo; `uploads/` is the only externally reachable input
  surface (mechanism in [streamlit-demo.md](./streamlit-demo.md)).
- **The canonical physical store is the MAIN checkout's `ml/data/`.** Worktrees
  use a symlink `<worktree>/ml/data → <main>/ml/data` created by `git wt`.
- **Upstream weights load from `ml/models/`, never the `ml/` root**, via
  `pose_weight_path(size)` / `bed_weight_path()`. The cache is disposable and
  re-downloadable; never curate a weight outside `ml/models/`.

See [ADR-012](../decisions/ml/ADR-012-ml-data-domain-first-layout.md) for the data
layout and supersede relationships. See
[ADR-015](../decisions/ml/ADR-015-ml-models-single-root.md) for the model layout.
