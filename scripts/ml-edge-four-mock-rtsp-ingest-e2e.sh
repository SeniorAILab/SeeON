#!/usr/bin/env bash
set -euo pipefail

image="${RTSP_FIXTURE_IMAGE:-bluenviron/mediamtx:1.19.1-ffmpeg}"
python_image="${INGEST_STUB_IMAGE:-python:3.11-slim}"
fixture="${RTSP_FIXTURE_NAME:-ml-edge-four-mock-rtsp}"
compose_project="${COMPOSE_PROJECT_NAME:-ml-edge-four-mock-e2e}"
frames="${MAX_FRAMES_PER_CAMERA:-1}"
wait_seconds="${RTSP_FIXTURE_WAIT_SECONDS:-60}"
network="${compose_project}_default"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp_root="${ML_EDGE_E2E_TMP_ROOT:-$repo_root/.omo/tmp}"
mkdir -p "$tmp_root"
tmpdir="$(mktemp -d "$tmp_root/ml-edge-four-mock.XXXXXX")"
config="$tmpdir/edge-cameras.json"
stub_script="$tmpdir/ingest_stub.py"
records="$tmpdir/ingest-records.jsonl"
stub="edge-ingest-stub-${compose_project}"
server="${fixture}-server"

cleanup_containers() {
  docker rm -f "$stub" "$server" >/dev/null 2>&1 || true
  for index in 1 2 3 4; do
    docker rm -f "${fixture}-camera-${index}" >/dev/null 2>&1 || true
  done
  EDGE_CAMERA_CONFIG="$config" docker compose \
    -p "$compose_project" \
    -f compose.edge.yaml \
    down --remove-orphans >/dev/null 2>&1 || true
}

cleanup() {
  cleanup_containers
  rm -rf "$tmpdir"
}

write_config() {
  cat >"$config" <<JSON
{
  "alert_api_url": "http://edge-ingest-stub:8080/ingest/alerts",
  "heartbeat_api_url": "http://edge-ingest-stub:8080/ingest/heartbeat",
  "cameras": [
    {
      "camera_id": "mock-camera-1",
      "facility_id": "facility-demo",
      "resident_id": "resident-1",
      "rtsp_url": "rtsp://rtsp-fixture:8554/camera-1",
      "ingest_key_id": "mock-camera-1-key-id",
      "ingest_secret": "replace-with-mock-camera-1-secret"
    },
    {
      "camera_id": "mock-camera-2",
      "facility_id": "facility-demo",
      "resident_id": "resident-2",
      "rtsp_url": "rtsp://rtsp-fixture:8554/camera-2",
      "ingest_key_id": "mock-camera-2-key-id",
      "ingest_secret": "replace-with-mock-camera-2-secret"
    },
    {
      "camera_id": "mock-camera-3",
      "facility_id": "facility-demo",
      "resident_id": "resident-3",
      "rtsp_url": "rtsp://rtsp-fixture:8554/camera-3",
      "ingest_key_id": "mock-camera-3-key-id",
      "ingest_secret": "replace-with-mock-camera-3-secret"
    },
    {
      "camera_id": "mock-camera-4",
      "facility_id": "facility-demo",
      "resident_id": "resident-4",
      "rtsp_url": "rtsp://rtsp-fixture:8554/camera-4",
      "ingest_key_id": "mock-camera-4-key-id",
      "ingest_secret": "replace-with-mock-camera-4-secret"
    }
  ]
}
JSON
  chmod 600 "$config"
}

write_stub() {
  cat >"$stub_script" <<'PY'
from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

records = Path("/work/ingest-records.jsonl")


class Handler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length)
        payload = json.loads(raw.decode("utf-8")) if raw else None
        with records.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps({"path": self.path, "payload": payload}) + "\n")
        self.send_response(201 if self.path == "/ingest/alerts" else 200)
        self.end_headers()
        self.wfile.write(b'{"ok":true}')

    def log_message(self, _format: str, *args: object) -> None:
        return


ThreadingHTTPServer(("0.0.0.0", 8080), Handler).serve_forever()
PY
}

start_compose_network() {
  EDGE_CAMERA_CONFIG="$config" docker compose \
    -p "$compose_project" \
    -f compose.edge.yaml \
    create --build ml-edge-worker >/dev/null
}

start_stub() {
  docker run -d \
    --name "$stub" \
    --network "$network" \
    --network-alias edge-ingest-stub \
    -v "$tmpdir:/work" \
    "$python_image" \
    python /work/ingest_stub.py \
    >/dev/null
}

start_rtsp_server() {
  docker run -d \
    --name "$server" \
    --network "$network" \
    --network-alias rtsp-fixture \
    "$image" \
    >/dev/null
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

run_worker_smoke() {
  EDGE_CAMERA_CONFIG="$config" docker compose \
    -p "$compose_project" \
    -f compose.edge.yaml \
    run -T --rm --no-deps --build ml-edge-worker \
    python - <<PY
from __future__ import annotations

import sys

from domains import DomainRegistration
from worker import edge_worker


class FakeRegistry:
    def create(self, task: str):
        return lambda image: None


class FallOnceDetector:
    enabled = True

    def __init__(self) -> None:
        self._sent = False

    def update(self, observation, time_sec=None):
        if self._sent:
            return ()
        self._sent = True
        return ({"domain": "fall", "event_type": "fall", "probability": 0.91},)


edge_worker.DEFAULT_REGISTRY = FakeRegistry()
edge_worker.DOMAIN_REGISTRY = {
    "fall": DomainRegistration("fall", FallOnceDetector, True),
}
raise SystemExit(
    edge_worker.main(
        [
            "--config",
            "/run/secrets/edge-cameras.json",
            "--max-frames-per-camera",
            "$frames",
            "--heartbeat-on-start",
        ]
    )
)
PY
}

assert_ingest_records() {
  python3 - "$records" <<'PY'
from __future__ import annotations

import json
import sys
from pathlib import Path

records = [json.loads(line) for line in Path(sys.argv[1]).read_text().splitlines()]
paths = [record["path"] for record in records]
if "/ingest/heartbeat" not in paths:
    raise SystemExit("missing /ingest/heartbeat request")
if "/ingest/alerts" not in paths:
    raise SystemExit("missing /ingest/alerts request")
alert_payloads = [record["payload"] for record in records if record["path"] == "/ingest/alerts"]
if not any(payload and payload.get("type") == "fall" for payload in alert_payloads):
    raise SystemExit("missing fall alert payload")
print("ingest records ok:", paths)
PY
}

trap cleanup EXIT
cleanup_containers
write_config
write_stub
start_compose_network
start_stub
start_rtsp_server
start_publisher 1 testsrc
start_publisher 2 testsrc2
start_publisher 3 smptebars
start_publisher 4 testsrc

for index in 1 2 3 4; do
  wait_for_stream "$index"
done

run_worker_smoke
assert_ingest_records
printf 'cleanup check will run via trap for project %s\n' "$compose_project"
