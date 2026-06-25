#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'MSG'
Usage: scripts/rtsp-loop-video.sh /absolute/or/relative/video.mp4

Streams a local video file forever as RTSP through MediaMTX.

Common env:
  RTSP_STREAM_NAME       Stream path, default: nursing-home
  RTSP_HOST_PORT         Host RTSP port, default: 8554; set empty to skip host publish
  RTSP_DOCKER_NETWORK    Existing Docker network to join; default: create a temporary network
  RTSP_NETWORK_ALIAS     Server alias inside Docker network, default: rtsp-fixture
  RTSP_DETACH            1 to leave containers running and exit after readiness
  RTSP_CONTAINER_PREFIX  Container/network name prefix, default: eldercare-rtsp-video

Examples:
  scripts/rtsp-loop-video.sh ml/data/nursing-home/processed/fall.mp4
  RTSP_STREAM_NAME=fall-01 RTSP_HOST_PORT=8555 scripts/rtsp-loop-video.sh /tmp/fall.mp4
MSG
}

video="${1:-${RTSP_VIDEO_PATH:-}}"
if [[ -z "$video" || "${video:-}" == "-h" || "${video:-}" == "--help" ]]; then
  usage
  exit 2
fi
if [[ ! -f "$video" ]]; then
  printf 'video file does not exist: %s\n' "$video" >&2
  exit 2
fi

video_dir="$(cd "$(dirname "$video")" && pwd)"
video_path="$video_dir/$(basename "$video")"
image="${RTSP_FIXTURE_IMAGE:-bluenviron/mediamtx:1.19.1-ffmpeg}"
prefix="${RTSP_CONTAINER_PREFIX:-eldercare-rtsp-video}"
server="${RTSP_SERVER_NAME:-${prefix}-server}"
publisher="${RTSP_PUBLISHER_NAME:-${prefix}-publisher}"
stream="${RTSP_STREAM_NAME:-nursing-home}"
network_alias="${RTSP_NETWORK_ALIAS:-rtsp-fixture}"
host_port="${RTSP_HOST_PORT-8554}"
wait_seconds="${RTSP_READY_WAIT_SECONDS:-${RTSP_FIXTURE_WAIT_SECONDS:-60}}"
detach="${RTSP_DETACH:-0}"
network_created=0

if [[ -n "${RTSP_DOCKER_NETWORK:-}" ]]; then
  network="$RTSP_DOCKER_NETWORK"
else
  network="${RTSP_NETWORK_NAME:-${prefix}-network}"
  if ! docker network inspect "$network" >/dev/null 2>&1; then
    docker network create "$network" >/dev/null
    network_created=1
  fi
fi

internal_url="rtsp://${network_alias}:8554/${stream}"
if [[ -n "$host_port" ]]; then
  host_url="rtsp://127.0.0.1:${host_port}/${stream}"
else
  host_url=""
fi

cleanup() {
  docker rm -f "$publisher" "$server" >/dev/null 2>&1 || true
  if [[ "$network_created" == "1" ]]; then
    docker network rm "$network" >/dev/null 2>&1 || true
  fi
}

wait_for_stream() {
  for _ in $(seq 1 "$wait_seconds"); do
    if docker run --rm --network "$network" --entrypoint ffprobe "$image" \
      -v error -rtsp_transport tcp -select_streams v:0 \
      -show_entries stream=codec_name,width,height \
      -of default=noprint_wrappers=1 "$internal_url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  printf 'RTSP stream did not become ready: %s\n' "$internal_url" >&2
  return 1
}

if [[ "$detach" != "1" ]]; then
  trap cleanup EXIT INT TERM
fi

docker rm -f "$publisher" "$server" >/dev/null 2>&1 || true

server_args=(docker run -d --name "$server" --network "$network" --network-alias "$network_alias")
if [[ -n "$host_port" ]]; then
  server_args+=(-p "${host_port}:8554")
fi
server_args+=("$image")
"${server_args[@]}" >/dev/null

docker run -d \
  --name "$publisher" \
  --network "$network" \
  --entrypoint /bin/sh \
  -v "$video_path:/input/video.mp4:ro" \
  "$image" \
  -lc \
  "while true; do ffmpeg -hide_banner -loglevel warning -stream_loop -1 -re -i /input/video.mp4 -an -c:v libx264 -preset ultrafast -tune zerolatency -f rtsp '${internal_url}' || true; sleep 1; done" \
  >/dev/null

wait_for_stream

printf 'RTSP stream ready\n'
printf '  video: %s\n' "$video_path"
printf '  internal: %s\n' "$internal_url"
if [[ -n "$host_url" ]]; then
  printf '  host: %s\n' "$host_url"
fi
printf '  server container: %s\n' "$server"
printf '  publisher container: %s\n' "$publisher"

if [[ "$detach" == "1" ]]; then
  exit 0
fi

printf 'Press Ctrl-C to stop the RTSP stream.\n'
while true; do
  if ! docker ps --format '{{.Names}}' | grep -qx "$publisher"; then
    printf 'publisher container stopped: %s\n' "$publisher" >&2
    exit 1
  fi
  if ! docker ps --format '{{.Names}}' | grep -qx "$server"; then
    printf 'server container stopped: %s\n' "$server" >&2
    exit 1
  fi
  sleep 5
done
