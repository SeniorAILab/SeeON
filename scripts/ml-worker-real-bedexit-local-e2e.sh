#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
rtsp_url="${NURSING_HOME_RTSP_URL:-${BED_EXIT_RTSP_URL:-}}"
backend_events_url="${ML_API_BACKEND_EVENTS_URL:-http://localhost:8080/api/v1/events}"
relay_base_url="${RELAY_URL:-http://127.0.0.1:8000}"
relay_token="${RELAY_TOKEN:-local-edge-relay-token}"
facility_id="${E2E_FACILITY_ID:-fac_happy_nokyang}"
resident_id="${E2E_RESIDENT_ID:-res_kim}"
camera_id="${E2E_CAMERA_ID:-cam_sp_201}"
night_window_start="${BED_EXIT_NIGHT_WINDOW_START:-21:00}"
night_window_end="${BED_EXIT_NIGHT_WINDOW_END:-05:00}"
night_window_tz="${BED_EXIT_NIGHT_WINDOW_TZ:-Asia/Seoul}"
mjpeg_host="${ML_WORKER_DEV_MJPEG_HOST:-127.0.0.1}"
mjpeg_port="${ML_WORKER_DEV_MJPEG_PORT:-8090}"
acceptance_clip="${ACCEPTANCE_CLIP_PATH:-$repo_root/ml/data/nursing-home/processed/2026-02-11 베스트요양원1 401호.mp4}"
tmp_root="${ML_EDGE_E2E_TMP_ROOT:-$repo_root/.gjc/tmp}"
mkdir -p "$tmp_root"
tmpdir="$(mktemp -d "$tmp_root/ml-worker-real-bedexit.XXXXXX")"
config="$tmpdir/ml-worker.yaml"
api_log="$tmpdir/ml-api.log"
worker_log="$tmpdir/ml-worker.log"
api_pid=""

cleanup() {
  if [[ -n "$api_pid" ]]; then
    kill "$api_pid" >/dev/null 2>&1 || true
    wait "$api_pid" >/dev/null 2>&1 || true
  fi
  if [[ "${KEEP_E2E_TMP:-0}" != "1" ]]; then
    rm -rf "$tmpdir"
  else
    printf 'kept temporary files: %s\n' "$tmpdir"
  fi
}

usage() {
  cat <<USAGE
Host-native real bed-exit local E2E helper.

This script never starts an in-repo RTSP publisher. Start an external camera or
SeniorAILab/rtsp-generator first, then provide the worker-reachable RTSP URL via
NURSING_HOME_RTSP_URL (preferred) or BED_EXIT_RTSP_URL.

Boot order:
  1. pnpm db:up
  2. pnpm prisma:seed && pnpm dev:backend  # backend on :8080
  3. start ml-api with this helper or: pnpm dev:ml-api
  4. external rtsp-generator/camera streams the 401 clip
  5. run this helper's worker mode with ML_WORKER_DEV_MJPEG=1
  6. pnpm dev:front with VITE_USE_MOCK unset/false

Required/preflighted:
  - NURSING_HOME_RTSP_URL or BED_EXIT_RTSP_URL = external RTSP input
  - model weights under ml/models/{pose,person,bed}
  - acceptance clip path: ACCEPTANCE_CLIP_PATH (defaults to the 401 clip)

Modes:
  all       write config, start local ml-api, then run the real ml-worker (default)
  api       write config and start local ml-api only
  worker    write config and run the real ml-worker only
  config    write config and print its path
  preflight validate local inputs only
  runbook   print browser verification URLs and operator notes

Important env defaults:
  camera_id=${camera_id} facility_id=${facility_id}
  relay=${relay_base_url} backend_events=${backend_events_url}
  night_window=${night_window_start}-${night_window_end} ${night_window_tz}
  mjpeg=http://${mjpeg_host}:${mjpeg_port}/stream/${camera_id}
USAGE
}

require_rtsp() {
  if [[ -z "$rtsp_url" ]]; then
    printf 'NURSING_HOME_RTSP_URL or BED_EXIT_RTSP_URL is required.\n' >&2
    printf 'Start external SeniorAILab/rtsp-generator or use a real camera, then pass a worker-reachable rtsp:// URL.\n' >&2
    printf 'Do not start MediaMTX/FFmpeg/file-to-RTSP inside this repository.\n' >&2
    return 1
  fi
  if [[ "$rtsp_url" != rtsp://* ]]; then
    printf 'RTSP URL must start with rtsp://: %s\n' "$rtsp_url" >&2
    return 1
  fi
}

require_file() {
  local path="$1"
  local label="$2"
  if [[ ! -f "$path" ]]; then
    printf 'missing %s: %s\n' "$label" "$path" >&2
    return 1
  fi
}

preflight() {
  require_rtsp
  require_file "$repo_root/ml/models/pose/yolo26n-pose.pt" 'pose model weight'
  require_file "$repo_root/ml/models/person/yolo26n.pt" 'person model weight'
  require_file "$repo_root/ml/models/bed/yolo26m-seg.pt" 'bed model weight'
  require_file "$acceptance_clip" 'acceptance clip'
  printf 'acceptance clip for external rtsp-generator: %s\n' "$acceptance_clip"
  printf 'fallback clips if 401 is unavailable: 베스트요양원2 203호, then 베스트요양원2 502호.\n'
}

write_config() {
  cat >"$config" <<YAML
version: 1
relay:
  url: ${relay_base_url}
  token: ${relay_token}
runtime:
  max_failures: 30
  open_timeout_ms: 20000
  read_timeout_ms: 20000
domains:
  bed_exit:
    enabled: true
    night_window:
      start: "${night_window_start}"
      end: "${night_window_end}"
      tz: ${night_window_tz}
cameras:
  - camera_id: ${camera_id}
    facility_id: ${facility_id}
    resident_id: ${resident_id}
    rtsp_url: ${rtsp_url}
    heartbeat_interval_sec: 30
    frame_stride: 1
    label: nursing-home-201-real-bed-exit
YAML
  chmod 600 "$config"
  EDGE_CAMERA_CONFIG="$config" uv run --directory "$repo_root/ml" python -m worker.edge_worker_config --check >/dev/null
  printf '%s\n' "$config"
}

start_api() {
  API_BACKEND_EVENTS_URL="$backend_events_url" \
  API_EDGE_RELAY_TOKEN="$relay_token" \
  API_CAMERA_INVENTORY="[{\"camera_id\":\"${camera_id}\",\"facility_id\":\"${facility_id}\",\"resident_id\":\"${resident_id}\"}]" \
  uv run --directory "$repo_root/ml" uvicorn api.main:app --host 127.0.0.1 --port "${relay_base_url##*:}" >"$api_log" 2>&1 &
  api_pid="$!"
  for _ in $(seq 1 60); do
    if curl -fsS "${relay_base_url}/health/live" >/dev/null 2>&1; then
      printf 'ml-api ready: %s (log: %s)\n' "$relay_base_url" "$api_log"
      return 0
    fi
    sleep 1
  done
  printf 'ml-api did not become healthy; log follows:\n' >&2
  sed -n '1,160p' "$api_log" >&2
  return 1
}

run_worker() {
  printf 'running real ml-worker with DEFAULT_REGISTRY; no scripted runners and no fake clock.\n'
  printf 'night window uses wall clock: %s-%s %s\n' "$night_window_start" "$night_window_end" "$night_window_tz"
  printf 'MJPEG browser URL: http://%s:%s/stream/%s\n' "$mjpeg_host" "$mjpeg_port" "$camera_id"
  OPENCV_FFMPEG_CAPTURE_OPTIONS="rtsp_transport;tcp" \
  ML_WORKER_DEV_MJPEG=1 \
  ML_WORKER_DEV_MJPEG_HOST="$mjpeg_host" \
  ML_WORKER_DEV_MJPEG_PORT="$mjpeg_port" \
  EDGE_CAMERA_CONFIG="$config" \
  uv run --directory "$repo_root/ml" python -m worker.edge_worker --config "$config" --heartbeat-on-start 2>&1 | tee "$worker_log"
}

print_runbook() {
  cat <<RUNBOOK
Two-browser live firing verification (requires external rtsp-generator/camera):
  left:  http://${mjpeg_host}:${mjpeg_port}/stream/${camera_id}
  right: product dashboard as director@happy-nokyang.local / 1234
         expect a 201호 bed-exit alert delivered from /api/v1/dashboard/stream

External RTSP input:
  Use the 401 clip with SeniorAILab/rtsp-generator and pass its worker-reachable URL:
    NURSING_HOME_RTSP_URL=rtsp://... $0 all
  Fallback clip order: 베스트요양원2 203호, then 베스트요양원2 502호.

Troubleshooting:
  - Missing weights: restore ml/models/pose/yolo26n-pose.pt, ml/models/person/yolo26n.pt, ml/models/bed/yolo26m-seg.pt.
  - RTSP unreachable: verify rtsp:// URL is reachable from this host and uses TCP transport.
  - Inventory mismatch: API_CAMERA_INVENTORY must include ${camera_id}/${facility_id}/${resident_id}.
  - No firing: this is real wall-clock mode; current ${night_window_tz} time must be inside ${night_window_start}-${night_window_end}.
  - Front stale/mocked: VITE_USE_MOCK must be unset or false; do not set VITE_USE_MOCK=true.
  - Realtime route: dashboard SSE is GET /api/v1/dashboard/stream; /api/v1/sse is absent.
RUNBOOK
}

mode="${1:-all}"
case "$mode" in
  -h|--help|help)
    usage
    ;;
  preflight)
    preflight
    ;;
  config)
    preflight
    write_config
    ;;
  api)
    trap cleanup EXIT
    preflight
    write_config >/dev/null
    start_api
    printf 'ml-api running; press Ctrl-C to stop.\n'
    wait "$api_pid"
    ;;
  worker)
    trap cleanup EXIT
    preflight
    write_config >/dev/null
    run_worker
    ;;
  all)
    trap cleanup EXIT
    preflight
    write_config >/dev/null
    start_api
    run_worker
    ;;
  runbook)
    print_runbook
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
