#!/usr/bin/env sh
set -eu

REPO_ROOT=$(CDPATH='' cd -- "$(dirname "$0")/../.." && pwd)
SCRIPT=$REPO_ROOT/scripts/deploy/verify-live-event-media-volume.sh
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT HUP INT TERM
mkdir -p "$TMP/bin"

cat > "$TMP/bin/docker" <<'EOF'
#!/usr/bin/env sh
printf 'docker %s\n' "$*" >> "${DOCKER_LOG:?}"
case "${1:-} ${2:-}" in
  'volume inspect') [ "${MISSING_VOLUME:-0}" != 1 ] ;;
  'ps --filter')
    case "${BACKEND_CONTAINER_STATE:-one}" in
      none) ;;
      multiple) printf '%s\n' backend-one backend-two ;;
      *) printf '%s\n' backend-one ;;
    esac
    ;;
  'inspect --format') printf '%s\n' "${MOUNTED_VOLUME:-repo_clips}" ;;
  'run --rm') [ "${UNREADABLE_VOLUME:-0}" != 1 ] ;;
  *) exit 1 ;;
esac
EOF
chmod +x "$TMP/bin/docker"

run_gate() {
  PATH="$TMP/bin:$PATH" DOCKER_LOG="$TMP/docker.log" \
    MISSING_VOLUME="${MISSING_VOLUME:-0}" BACKEND_CONTAINER_STATE="${BACKEND_CONTAINER_STATE:-one}" \
    MOUNTED_VOLUME="${MOUNTED_VOLUME:-repo_clips}" UNREADABLE_VOLUME="${UNREADABLE_VOLUME:-0}" \
    EVENT_MEDIA_CLIP_VOLUME=attacker_controlled sh "$SCRIPT" 2>&1
}
assert_failure() { [ "$1" -ne 0 ] || { printf '%s\n' 'live clip volume gate unexpectedly passed' >&2; exit 1; }; }
assert_contains() { case "$1" in *"$2"*) ;; *) printf 'missing expected output: %s\n%s\n' "$2" "$1" >&2; exit 1;; esac; }

: > "$TMP/docker.log"
output=$(run_gate)
assert_contains "$output" 'live event media volume verified: repo_clips'
log=$(cat "$TMP/docker.log")
assert_contains "$log" 'docker volume inspect repo_clips'
assert_contains "$log" 'label=com.docker.compose.service=backend'
assert_contains "$log" 'volume=repo_clips'
assert_contains "$log" 'dst=/clips,readonly'
case "$log" in *attacker_controlled*) printf '%s\n' 'process env overrode fixed live clip volume identity' >&2; exit 1;; esac
case "$log" in *'volume rm'*|*'volume prune'*|*'system prune'*) printf '%s\n' 'live volume verification used a destructive Docker command' >&2; exit 1;; esac

for scenario in missing-volume missing-backend multiple-backends wrong-mount unreadable; do
  : > "$TMP/docker.log"
  set +e
  case "$scenario" in
    missing-volume) output=$(MISSING_VOLUME=1 run_gate); status=$?; expected='required live event media volume is unavailable: repo_clips' ;;
    missing-backend) output=$(BACKEND_CONTAINER_STATE=none run_gate); status=$?; expected='exactly one running backend must use repo_clips' ;;
    multiple-backends) output=$(BACKEND_CONTAINER_STATE=multiple run_gate); status=$?; expected='exactly one running backend must use repo_clips' ;;
    wrong-mount) output=$(MOUNTED_VOLUME=other_clips run_gate); status=$?; expected='backend clip mount must use repo_clips' ;;
    unreadable) output=$(UNREADABLE_VOLUME=1 run_gate); status=$?; expected='live event media volume is not readable' ;;
  esac
  set -e
  assert_failure "$status"
  assert_contains "$output" "$expected"
done

printf '%s\n' 'live event media volume tests passed'
