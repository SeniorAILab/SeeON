# ML agent rules — Python/uv edge runtime (run/boot/flow in root AGENTS.md)

## Layout — import direction is one-way L0→L4, never import upward (ADR-057)

```
ml/
├── contracts/    # L0 pure contracts: frame, observation, model, artifacts, event
├── features/     # L0 pure feature math: pose_normalization, window_features, geometry
├── sources/      # L1 FrameSource intake: video_file, webcam, rtsp, registry, camera_probe (ADR-056)
├── runners/      # L1 model runners + ModelRegistry: yolo_pose, yolo_bed_seg, sklearn_fall, device
├── perception/   # L2 observation assembly: tracker, observation_builder, window_buffer, scene_state
├── domains/      # L3 interpreters: fall, bed_exit (+ DomainRegistry)
├── runtime/      # L3 edge orchestration: camera_manager/worker, scheduler, incident_manager, edge_runtime
├── events/       # L4 alert signing/outbox/publisher → POST /ingest/alerts HMAC (ADR-029/035)
├── serving/      # FastAPI app factory/lifespan/routes (ADR-022/023/048)
├── demo/         # Streamlit overlay; fall classification via serving only (ADR-010/011)
├── training/     # imports only contracts/features/sources/runners (ADR-013/022)
├── core/ util/   # shared helpers
├── data/ models/ # gitignored: data/ = {domain}/{raw,processed,poses}; models/ = {pose,fall}+metadata.json
└── tests/ experiments/
```

## Guards
- `contracts/` + `features/` are L0 pure: no I/O, no model loading, no side effects.
- Fall classification happens ONLY via `serving/` — `demo/` renders overlays + calls serving, never classifies.
- `data/` + `models/` are gitignored single-roots.

## Run
- uv only; test: `uv run --directory ml pytest`.
