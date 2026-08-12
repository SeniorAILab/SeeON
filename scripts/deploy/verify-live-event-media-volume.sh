#!/usr/bin/env sh
set -eu
set +x

LIVE_CLIP_VOLUME=repo_clips
HELPER_IMAGE=postgres:17-alpine

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

[ "$#" -eq 0 ] || fail 'Usage: verify-live-event-media-volume.sh'
for tool in awk docker grep sed wc; do
  command -v "$tool" >/dev/null 2>&1 || fail "required live media validation tool is missing: $tool"
done

docker volume inspect "$LIVE_CLIP_VOLUME" >/dev/null 2>&1 || \
  fail "required live event media volume is unavailable: $LIVE_CLIP_VOLUME"
backend_containers=$(docker ps \
  --filter 'label=com.docker.compose.service=backend' \
  --filter "volume=$LIVE_CLIP_VOLUME" \
  --format '{{.ID}}') || fail 'unable to inspect the running backend media mount'
backend_count=$(printf '%s\n' "$backend_containers" | sed '/^$/d' | wc -l | awk '{print $1}')
[ "$backend_count" -eq 1 ] || fail "exactly one running backend must use $LIVE_CLIP_VOLUME"
backend_container=$(printf '%s\n' "$backend_containers" | sed -n '1p')
mounted_clip_volume=$(docker inspect --format \
  '{{range .Mounts}}{{if eq .Destination "/app/backend/clips"}}{{println .Name}}{{end}}{{end}}' \
  "$backend_container") || fail 'unable to inspect the backend clip mount'
[ "$mounted_clip_volume" = "$LIVE_CLIP_VOLUME" ] || \
  fail "backend clip mount must use $LIVE_CLIP_VOLUME"

docker run --rm --pull never --network none --read-only \
  --mount "type=volume,src=$LIVE_CLIP_VOLUME,dst=/clips,readonly" \
  "$HELPER_IMAGE" sh -ceu 'test -r /clips; find /clips -mindepth 1 -maxdepth 1 -print -quit >/dev/null' \
  || fail 'live event media volume is not readable'

printf 'live event media volume verified: %s\n' "$LIVE_CLIP_VOLUME"
