#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  cat <<'EOF'
Usage: scripts/ml-worker-real-rtsp-bedexit-e2e.sh

Runs the real RTSP bed-exit worker proof for fac_happy_nokyang/cam_sp_202.

Options:
  -h, --help  Show this help and exit.

Environment:
  BED_EXIT_RTSP_URL        RTSP stream URL to consume.
  ML_MODELS_DIR           Model artifact root, default: <repo>/ml/models.
  BACKEND_BASE_URL        Backend URL, default: http://127.0.0.1:8080.
  RELAY_URL               ML API relay URL, default: http://127.0.0.1:8000.
  RELAY_TOKEN             Relay bearer token.
  E2E_FACILITY_ID         Facility id, default: fac_happy_nokyang.
  E2E_CAMERA_ID           Camera id, default: cam_sp_202.
  E2E_RESIDENT_ID         Resident id, default: res_kim.
  MAX_FRAMES_PER_CAMERA   Worker frame limit, default: 3200.
  EVIDENCE_DIR            Evidence output directory.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

backend_base_url="${BACKEND_BASE_URL:-http://127.0.0.1:8080}"
relay_base_url="${RELAY_URL:-http://127.0.0.1:8000}"
relay_token="${RELAY_TOKEN:-local-edge-relay-token}"
rtsp_url="${BED_EXIT_RTSP_URL:-rtsp://127.0.0.1:8554/s1/trackID-1/streamID-2}"
models_dir="${ML_MODELS_DIR:-$repo_root/ml/models}"
facility_id="${E2E_FACILITY_ID:-fac_happy_nokyang}"
resident_id="${E2E_RESIDENT_ID:-res_kim}"
camera_id="${E2E_CAMERA_ID:-cam_sp_202}"
frames="${MAX_FRAMES_PER_CAMERA:-3200}"
night_window_tz="${BED_EXIT_NIGHT_WINDOW_TZ:-Asia/Seoul}"
policy_cooldown_sec="${ALERT_COOLDOWN_SEC:-60}"
db_container="${E2E_DB_CONTAINER:-eldercare-fall-db}"
postgres_user="${POSTGRES_USER:-fall}"
postgres_db="${POSTGRES_DB:-fall_dev}"
evidence_dir="${EVIDENCE_DIR:-$repo_root/.omo/evidence/ml-event-alert-e2e-nokyang/worker-real-rtsp}"
tmp_root="${ML_EDGE_E2E_TMP_ROOT:-$repo_root/.omo/tmp}"

mkdir -p "$evidence_dir" "$tmp_root"
tmpdir="$(mktemp -d "$tmp_root/ml-worker-real-rtsp-bedexit.XXXXXX")"
runtime_lstm_dir="$tmpdir/models/fall/lstm-runtime"
include_config="$tmpdir/ml-worker-include.yaml"
exclude_config="$tmpdir/ml-worker-exclude.yaml"
include_log="$evidence_dir/worker-include.log"
exclude_log="$evidence_dir/worker-exclude.log"
summary="$evidence_dir/summary.md"
command_file="$evidence_dir/command.txt"

cleanup() {
  rm -rf "$tmpdir"
}
trap cleanup EXIT

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

psql_scalar() {
  docker exec "$db_container" psql -U "$postgres_user" -d "$postgres_db" -tAc "$1" | tr -d '[:space:]'
}

psql_json() {
  docker exec "$db_container" psql -U "$postgres_user" -d "$postgres_db" -tAc "$1"
}

require_services() {
  curl -fsS "${backend_base_url}/" >/dev/null 2>&1 ||
    fail "backend is not reachable at ${backend_base_url}"
  curl -fsS "${relay_base_url}/health/live" >/dev/null 2>&1 ||
    fail "ml-api relay is not healthy at ${relay_base_url}"
  docker exec "$db_container" psql -U "$postgres_user" -d "$postgres_db" -tAc "select 1;" >/dev/null ||
    fail "database container is not reachable: ${db_container}"
  psql_scalar "select count(*) from cameras where id = '${camera_id}' and facility_id = '${facility_id}';" |
    grep -qx '1' || fail "camera/facility seed not found: ${facility_id}/${camera_id}"
}

require_artifacts() {
  local source_lstm_dir="$models_dir/fall/lstm"
  local required=(
    "$repo_root/ml/worker/models/person/yolo26n.pt"
    "$repo_root/ml/models/pose/yolo26n-pose.pt"
    "$repo_root/ml/models/bed/yolo26m-seg.pt"
    "$source_lstm_dir/model.pt"
    "$source_lstm_dir/arch.json"
    "$source_lstm_dir/metadata.yaml"
  )
  for path in "${required[@]}"; do
    [[ -f "$path" ]] || fail "missing real model artifact: $path"
  done
}

write_lstm_runtime_artifact() {
  local source_lstm_dir="$models_dir/fall/lstm"
  mkdir -p "$runtime_lstm_dir"
  cp "$source_lstm_dir/model.pt" "$runtime_lstm_dir/model.pt"
  cp "$source_lstm_dir/arch.json" "$runtime_lstm_dir/arch.json"
  cp "$source_lstm_dir/metadata.yaml" "$runtime_lstm_dir/metadata.yaml"
  {
    printf 'source_lstm_dir=%s\n' "$source_lstm_dir"
    printf 'runtime_lstm_dir=%s\n' "$runtime_lstm_dir"
    shasum -a 256 "$runtime_lstm_dir/model.pt" "$runtime_lstm_dir/arch.json" "$runtime_lstm_dir/metadata.yaml"
  } >"$evidence_dir/lstm-runtime-artifact.txt"
}

compute_windows() {
  python3 - "$night_window_tz" <<'PY'
from __future__ import annotations

import sys
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

now = datetime.now(ZoneInfo(sys.argv[1]))

def hhmm(dt: datetime) -> str:
    return dt.strftime("%H:%M")

print(f'include_window_start="{hhmm(now - timedelta(hours=2))}"')
print(f'include_window_end="{hhmm(now + timedelta(hours=2))}"')
print(f'exclude_window_start="{hhmm(now + timedelta(hours=4))}"')
print(f'exclude_window_end="{hhmm(now + timedelta(hours=5))}"')
print(f'window_now="{now.isoformat()}"')
PY
}

write_config() {
  local path="$1"
  local window_start="$2"
  local window_end="$3"
  cat >"$path" <<YAML
version: 1
relay:
  url: ${relay_base_url}
  token: ${relay_token}
runtime:
  max_failures: 30
  open_timeout_ms: 20000
  read_timeout_ms: 20000
models:
  fall:
    type: lstm
    framework: pytorch
    mode: sequence
    artifact_dir: ${runtime_lstm_dir}
    weights: model.pt
    architecture: arch.json
    metadata: metadata.yaml
    window: 30
    stride: 5
    input_shape: [30, 51]
    operating_threshold: 0.5
domains:
  fall:
    enabled: false
  bed_exit:
    enabled: true
    night_window:
      start: "${window_start}"
      end: "${window_end}"
      tz: ${night_window_tz}
  wheelchair_standup:
    enabled: false
  long_lie:
    enabled: false
  risk:
    enabled: false
cameras:
  - camera_id: ${camera_id}
    facility_id: ${facility_id}
    resident_id: ${resident_id}
    rtsp_url: ${rtsp_url}
    heartbeat_interval_sec: 30
    frame_stride: 1
    label: real-rtsp-bed-exit
YAML
  chmod 600 "$path"
}

redact_config() {
  local source="$1"
  local target="$2"
  sed 's/^  token: .*/  token: <redacted>/' "$source" >"$target"
}

wait_for_policy_cooldown() {
  local wait_sec
  wait_sec="$(psql_scalar "select greatest(0, ${policy_cooldown_sec} - coalesce(extract(epoch from now() - max(created_at)), ${policy_cooldown_sec}))::int from alerts where facility_id = '${facility_id}' and camera_id = '${camera_id}' and type = 'bed-exit';")"
  if [[ "$wait_sec" =~ ^[0-9]+$ ]] && (( wait_sec > 0 )); then
    printf 'waiting %ss for backend alert cooldown before include pass\n' "$((wait_sec + 2))"
    sleep "$((wait_sec + 2))"
  fi
}

run_worker() {
  local config="$1"
  local log="$2"
  : >"$log"
  OPENCV_FFMPEG_CAPTURE_OPTIONS="rtsp_transport;tcp" \
    EDGE_CAMERA_CONFIG="$config" \
    PYTHONUNBUFFERED=1 \
    uv run --directory "$repo_root/ml" \
    python -m worker.edge_worker \
    --config "$config" \
    --max-frames-per-camera "$frames" \
    --heartbeat-on-start >"$log" 2>&1
}

count_events_since() {
  local started_at="$1"
  psql_scalar "select count(*) from events where facility_id = '${facility_id}' and camera_id = '${camera_id}' and type = 'bed-exit' and created_at >= '${started_at}'::timestamptz;"
}

count_alerts_since() {
  local started_at="$1"
  psql_scalar "select count(*) from alerts where facility_id = '${facility_id}' and camera_id = '${camera_id}' and type = 'bed-exit' and created_at >= '${started_at}'::timestamptz;"
}

capture_rows_since() {
  local label="$1"
  local started_at="$2"
  psql_json "select coalesce(json_agg(row_to_json(t)), '[]'::json) from (select id, facility_id, camera_id, space_id, type, confidence, detected_at, created_at from events where facility_id = '${facility_id}' and camera_id = '${camera_id}' and type = 'bed-exit' and created_at >= '${started_at}'::timestamptz order by created_at desc) t;" >"$evidence_dir/${label}-events.json"
  psql_json "select coalesce(json_agg(row_to_json(t)), '[]'::json) from (select alert_seq::text as alert_seq, id, facility_id, resident_id, camera_id, space_id, type, probability, detected_at, status, origin_event_id, created_at from alerts where facility_id = '${facility_id}' and camera_id = '${camera_id}' and type = 'bed-exit' and created_at >= '${started_at}'::timestamptz order by created_at desc) t;" >"$evidence_dir/${label}-alerts.json"
}

write_command_file() {
  cat >"$command_file" <<EOF
BED_EXIT_RTSP_URL='${rtsp_url}' \\
ML_MODELS_DIR='${models_dir}' \\
BACKEND_BASE_URL='${backend_base_url}' \\
RELAY_URL='${relay_base_url}' \\
RELAY_TOKEN='<redacted>' \\
E2E_FACILITY_ID='${facility_id}' \\
E2E_CAMERA_ID='${camera_id}' \\
E2E_RESIDENT_ID='${resident_id}' \\
MAX_FRAMES_PER_CAMERA='${frames}' \\
scripts/ml-worker-real-rtsp-bedexit-e2e.sh
EOF
}

write_summary() {
  local include_started_at="$1"
  local include_events="$2"
  local include_alerts="$3"
  local exclude_started_at="$4"
  local exclude_events="$5"
  local exclude_alerts="$6"
  cat >"$summary" <<EOF
# Real RTSP worker bed-exit E2E

- Captured at: $(date -u +%Y-%m-%dT%H:%M:%SZ)
- Worker: real \`python -m worker.edge_worker\`
- RTSP source: \`${rtsp_url}\`
- Facility/camera/resident: \`${facility_id}\` / \`${camera_id}\` / \`${resident_id}\`
- Backend: \`${backend_base_url}\`
- Relay: \`${relay_base_url}\`
- Frames per pass: \`${frames}\`
- Clock timezone: \`${night_window_tz}\`
- Real model artifacts: \`${models_dir}\`
- LSTM runtime artifact proof: \`$evidence_dir/lstm-runtime-artifact.txt\`
- No mocks/stubs/fakes: no runner injection, no monkeypatching, no fake backend, no fake RTSP server in this repo.

## Night-window include pass

- Started at: \`${include_started_at}\`
- Window at real clock \`${window_now}\`: \`${include_window_start}-${include_window_end} ${night_window_tz}\`
- New backend events: \`${include_events}\`
- New backend alerts: \`${include_alerts}\`
- Worker log: \`$include_log\`
- Events readback: \`$evidence_dir/include-events.json\`
- Alerts readback: \`$evidence_dir/include-alerts.json\`

## Night-window exclude pass

- Started at: \`${exclude_started_at}\`
- Window at real clock \`${window_now}\`: \`${exclude_window_start}-${exclude_window_end} ${night_window_tz}\`
- New backend events: \`${exclude_events}\`
- New backend alerts: \`${exclude_alerts}\`
- Worker log: \`$exclude_log\`
- Events readback: \`$evidence_dir/exclude-events.json\`
- Alerts readback: \`$evidence_dir/exclude-alerts.json\`

## Config evidence

- Include config redacted: \`$evidence_dir/include-config.redacted.yaml\`
- Exclude config redacted: \`$evidence_dir/exclude-config.redacted.yaml\`
- Exact command: \`$command_file\`
EOF
}

require_command curl
require_command docker
require_command python3
require_command uv
require_services
require_artifacts
write_lstm_runtime_artifact
eval "$(compute_windows)"
write_config "$include_config" "$include_window_start" "$include_window_end"
write_config "$exclude_config" "$exclude_window_start" "$exclude_window_end"
redact_config "$include_config" "$evidence_dir/include-config.redacted.yaml"
redact_config "$exclude_config" "$evidence_dir/exclude-config.redacted.yaml"
write_command_file

uv run --directory "$repo_root/ml" python -m worker.edge_worker --config "$include_config" --check-config >/dev/null
uv run --directory "$repo_root/ml" python -m worker.edge_worker --config "$exclude_config" --check-config >/dev/null

wait_for_policy_cooldown

include_started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
run_worker "$include_config" "$include_log"
include_events="$(count_events_since "$include_started_at")"
include_alerts="$(count_alerts_since "$include_started_at")"
capture_rows_since include "$include_started_at"

if [[ "$include_events" -lt 1 || "$include_alerts" -lt 1 ]]; then
  write_summary "$include_started_at" "$include_events" "$include_alerts" "" "" ""
  printf 'include pass failed: events=%s alerts=%s\n' "$include_events" "$include_alerts" >&2
  printf 'worker include log follows:\n' >&2
  sed -n '1,220p' "$include_log" >&2
  exit 1
fi

exclude_started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
run_worker "$exclude_config" "$exclude_log"
exclude_events="$(count_events_since "$exclude_started_at")"
exclude_alerts="$(count_alerts_since "$exclude_started_at")"
capture_rows_since exclude "$exclude_started_at"

write_summary "$include_started_at" "$include_events" "$include_alerts" "$exclude_started_at" "$exclude_events" "$exclude_alerts"

if [[ "$exclude_events" -ne 0 || "$exclude_alerts" -ne 0 ]]; then
  printf 'exclude pass failed: events=%s alerts=%s\n' "$exclude_events" "$exclude_alerts" >&2
  printf 'worker exclude log follows:\n' >&2
  sed -n '1,220p' "$exclude_log" >&2
  exit 1
fi

printf 'real RTSP bed-exit worker E2E ok: include events=%s alerts=%s; exclude events=%s alerts=%s; evidence=%s\n' \
  "$include_events" "$include_alerts" "$exclude_events" "$exclude_alerts" "$evidence_dir"
