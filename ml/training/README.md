# training (batch lifecycle)

Deferred for the PoC. This is the **batch** lifecycle — distinct from `serving/`
(online).

```
input:      dataset (ml/data/processed)
runtime:    minutes/hours
output:     model artifact -> ml/artifacts/fall-detector/<version>/
dependency: training libs, augmentation, experiment tracking (uv group `training`)
```

When training work starts, add deps to the `training` dependency group in
`pyproject.toml` (ultralytics YOLO11-pose, torch, augmentation, experiment
tracking) and run `uv sync --group training`.

Data lives under `ml/data/` (relocated from the old `assets/`):
- `ml/data/raw/` — source videos
- `ml/data/processed/` — cropped/renamed clips (see the `fall-video-crop-rename` skill)
