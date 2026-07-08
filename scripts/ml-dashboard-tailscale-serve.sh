#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ML_DASHBOARD_PORT="${ML_DASHBOARD_PORT:-5173}"
ML_SERVING_PORT="${ML_SERVING_PORT:-8000}"
TAILSCALE_SERVE_PORT="${TAILSCALE_SERVE_PORT:-443}"
dashboard_target="http://127.0.0.1:${ML_DASHBOARD_PORT}"

usage() {
  cat >&2 <<'USAGE'
Usage:
  scripts/ml-dashboard-tailscale-serve.sh dashboard
  scripts/ml-dashboard-tailscale-serve.sh serve <peer-label>
  scripts/ml-dashboard-tailscale-serve.sh off

Commands:
  dashboard      Start the Vite dashboard on 127.0.0.1 with a local ml-api proxy.
  serve          Check local Tailscale state, verify a peer, then map the dashboard.
  off            Remove this dashboard mapping with the positional off form.

Environment:
  ML_DASHBOARD_PORT      Local dashboard port, default 5173.
  ML_SERVING_PORT        Local ml-api port, default 8000.
  TAILSCALE_SERVE_PORT   Tailnet HTTPS port, default 443.

This helper accepts only these commands; public internet sharing is out of scope.
USAGE
}

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf 'ERROR: required command is not installed: %s\n' "$command_name" >&2
    exit 1
  fi
}

require_tailnet_ready() {
  local peer_label="$1"

  if ! tailscale status --self >/dev/null 2>&1; then
    printf 'ERROR: local Tailscale status check failed; connect this device first.\n' >&2
    exit 1
  fi

  if ! tailscale ping --c 1 "$peer_label" >/dev/null 2>&1; then
    printf 'ERROR: required tailnet peer is not reachable; check the peer label.\n' >&2
    exit 1
  fi
}

run_dashboard() {
  require_command pnpm
  ML_API_PROXY_TARGET=http://127.0.0.1:${ML_SERVING_PORT} \
    pnpm --dir "$repo_root/ml/dashboard" dev --host 127.0.0.1 --port "$ML_DASHBOARD_PORT"
}

run_serve() {
  local peer_label="${1:-}"
  if [ -z "$peer_label" ]; then
    usage
    exit 2
  fi

  require_command tailscale
  require_tailnet_ready "$peer_label"

  if ! tailscale serve --bg --https="$TAILSCALE_SERVE_PORT" "$dashboard_target" >/dev/null 2>&1; then
    printf 'ERROR: dashboard tailnet mapping failed; no topology details were printed.\n' >&2
    exit 1
  fi

  printf 'Dashboard tailnet mapping enabled for local target %s.\n' "$dashboard_target"
  printf 'Teardown: scripts/ml-dashboard-tailscale-serve.sh off\n'
}

run_serve_off() {
  require_command tailscale

  if ! tailscale serve --https="$TAILSCALE_SERVE_PORT" "$dashboard_target" off >/dev/null 2>&1; then
    printf 'ERROR: dashboard tailnet mapping teardown failed.\n' >&2
    exit 1
  fi

  printf 'Dashboard tailnet mapping removed for local target %s.\n' "$dashboard_target"
}

case "${1:-}" in
  dashboard)
    run_dashboard
    ;;
  serve)
    case "${2:-}" in
      "")
        usage
        exit 2
        ;;
      -*)
        usage
        exit 2
        ;;
      *)
        run_serve "$2"
        ;;
    esac
    ;;
  off)
    run_serve_off
    ;;
  *)
    usage
    exit 2
    ;;
esac
