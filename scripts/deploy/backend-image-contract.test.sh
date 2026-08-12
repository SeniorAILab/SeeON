#!/usr/bin/env sh
set -eu

REPO_ROOT=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)
IMAGE="eldercare-backend-contract:$$"
DEPLOY_SHA=0000000000000000000000000000000000000000

cleanup() {
  trap - 0 HUP INT TERM
  docker image rm -f "$IMAGE" >/dev/null 2>&1 || true
}
trap cleanup 0
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

docker build \
  --file "$REPO_ROOT/backend/Dockerfile" \
  --build-arg "DEPLOY_SHA=$DEPLOY_SHA" \
  --tag "$IMAGE" \
  "$REPO_ROOT"

command_config=$(docker image inspect --format '{{json .Config.Cmd}}' "$IMAGE")
[ "$command_config" = '["node","dist/main"]' ] || {
  printf 'unexpected production command: %s\n' "$command_config" >&2
  exit 1
}

docker run --rm --entrypoint sh "$IMAGE" -eu -c '
  artifact=/app/backend/dist-tools/prisma/reset-admin-password.js
  [ -f "$artifact" ]
  [ ! -L "$artifact" ]
  [ -s "$artifact" ]
'

help_output=$(docker run --rm --entrypoint node "$IMAGE" \
  /app/backend/dist-tools/prisma/reset-admin-password.js --help)
[ "$help_output" = 'Usage: reset-admin-password --email <ADMIN email> (password is read from ADMIN_PASSWORD_FD, default stdin)' ] || {
  printf 'unexpected maintenance command help: %s\n' "$help_output" >&2
  exit 1
}

printf '%s\n' 'backend Docker maintenance-command contract: PASS'
