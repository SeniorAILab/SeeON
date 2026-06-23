#!/usr/bin/env bash
set -euo pipefail

image="${RTSP_FIXTURE_IMAGE:-bluenviron/mediamtx:1.19.1-ffmpeg}"
fixture="${RTSP_FIXTURE_NAME:-eldercare-edge-rtsp-fixture}"
compose_project="${COMPOSE_PROJECT_NAME:-eldercare-edge-product-e2e}"
config="${EDGE_CAMERA_CONFIG:-./ml/config/edge-cameras.mock.local.json}"
frames="${MAX_FRAMES_PER_CAMERA:-1}"
wait_seconds="${RTSP_FIXTURE_WAIT_SECONDS:-60}"
network="${compose_project}_default"
server="${fixture}-server"
unused_ingest_url_for_rtsp_only_smoke="http://ml-edge-api:8000/health/live"

cleanup() {
  docker rm -f "$server" >/dev/null 2>&1 || true
  for index in 1 2 3 4; do
    docker rm -f "${fixture}-camera-${index}" >/dev/null 2>&1 || true
  done
  EDGE_CAMERA_CONFIG="$config" docker compose \
    -p "$compose_project" \
    -f compose.edge.yaml \
    down -v --remove-orphans >/dev/null 2>&1 || true
}

write_config() {
  mkdir -p "$(dirname "$config")"
  cat >"$config" <<JSON
{
  "alert_api_url": "$unused_ingest_url_for_rtsp_only_smoke",
  "cameras": [
    {
      "camera_id": "mock-camera-1",
      "facility_id": "facility-demo",
      "resident_id": null,
      "rtsp_url": "rtsp://rtsp-fixture:8554/camera-1",
      "ingest_key_id": "mock-camera-1-key-id",
      "ingest_secret": "replace-with-mock-camera-1-secret"
    },
    {
      "camera_id": "mock-camera-2",
      "facility_id": "facility-demo",
      "resident_id": null,
      "rtsp_url": "rtsp://rtsp-fixture:8554/camera-2",
      "ingest_key_id": "mock-camera-2-key-id",
      "ingest_secret": "replace-with-mock-camera-2-secret"
    },
    {
      "camera_id": "mock-camera-3",
      "facility_id": "facility-demo",
      "resident_id": null,
      "rtsp_url": "rtsp://rtsp-fixture:8554/camera-3",
      "ingest_key_id": "mock-camera-3-key-id",
      "ingest_secret": "replace-with-mock-camera-3-secret"
    },
    {
      "camera_id": "mock-camera-4",
      "facility_id": "facility-demo",
      "resident_id": null,
      "rtsp_url": "rtsp://rtsp-fixture:8554/camera-4",
      "ingest_key_id": "mock-camera-4-key-id",
      "ingest_secret": "replace-with-mock-camera-4-secret"
    }
  ]
}
JSON
  chmod 600 "$config"
}

start_publisher() {
  local index="$1"
  local source="$2"
  docker run -d \
    --name "${fixture}-camera-${index}" \
    --network "$network" \
    --entrypoint /bin/sh \
    "$image" \
    -lc \
    "while true; do ffmpeg -hide_banner -loglevel warning -re -f lavfi -i ${source}=size=320x240:rate=5 -pix_fmt yuv420p -c:v libx264 -preset ultrafast -tune zerolatency -g 5 -keyint_min 5 -sc_threshold 0 -f rtsp rtsp://rtsp-fixture:8554/camera-${index} || true; sleep 1; done" \
    >/dev/null
}

wait_for_stream() {
  local index="$1"
  local url="rtsp://rtsp-fixture:8554/camera-${index}"
  for _ in $(seq 1 "$wait_seconds"); do
    if docker run --rm --network "$network" --entrypoint ffprobe "$image" \
      -v error -rtsp_transport tcp -select_streams v:0 \
      -show_entries stream=codec_name,width,height \
      -of default=noprint_wrappers=1 "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  printf 'RTSP fixture did not become ready: %s\n' "$url" >&2
  return 1
}

trap cleanup EXIT
cleanup
write_config

EDGE_CAMERA_CONFIG="$config" docker compose \
  -p "$compose_project" \
  -f compose.edge.yaml \
  up -d --build ml-edge-api

docker run -d \
  --name "$server" \
  --network "$network" \
  --network-alias rtsp-fixture \
  "$image" \
  >/dev/null

start_publisher 1 testsrc
start_publisher 2 testsrc2
start_publisher 3 smptebars
start_publisher 4 testsrc

for index in 1 2 3 4; do
  wait_for_stream "$index"
done

EDGE_CAMERA_CONFIG="$config" docker compose \
  -p "$compose_project" \
  -f compose.edge.yaml \
  run --rm --no-deps --build ml-edge-worker \
  python -m worker.edge_worker \
  --config /run/secrets/edge-cameras.json \
  --max-frames-per-camera "$frames"
