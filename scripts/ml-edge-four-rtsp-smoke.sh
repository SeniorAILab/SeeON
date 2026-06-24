#!/usr/bin/env bash
set -euo pipefail

config="${EDGE_CAMERA_CONFIG:?EDGE_CAMERA_CONFIG is required}"
frames="${MAX_FRAMES_PER_CAMERA:-30}"

mapfile -t urls < <(
  python3 - "$config" <<'PY'
import sys
import yaml

with open(sys.argv[1], encoding="utf-8") as handle:
    config = yaml.safe_load(handle)

for camera in config["cameras"]:
    print(camera["rtsp_url"])
PY
)

if [[ "${#urls[@]}" -ne 4 ]]; then
  printf 'expected exactly 4 cameras, got %s\n' "${#urls[@]}" >&2
  exit 2
fi

for url in "${urls[@]}"; do
  ffprobe \
    -v error \
    -rtsp_transport tcp \
    -select_streams v:0 \
    -show_entries stream=codec_name,width,height \
    -of default=noprint_wrappers=1 \
    "$url" >/dev/null
done

uv run --directory ml python -m worker.edge_worker \
  --config "$config" \
  --max-frames-per-camera "$frames" \
  --heartbeat-on-start
