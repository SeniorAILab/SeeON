#!/usr/bin/env sh
set -eu

REPO_ROOT=$(CDPATH='' cd -- "$(dirname "$0")/../.." && pwd)
DOCKERFILE=$REPO_ROOT/front/Dockerfile
VALID_SHA=0123456789abcdef0123456789abcdef01234567
SECOND_VALID_SHA=89abcdef0123456789abcdef0123456789abcdef
TEST_IMAGE=eldercare-front-version-contract-$$:latest
image_built=false

cleanup() {
  if [ "$image_built" = true ]; then
    docker image rm -f "$TEST_IMAGE" >/dev/null || :
  fi
}
trap cleanup EXIT HUP INT TERM

expect_build_failure() {
  label=$1
  shift

  if docker build --target runner -f "$DOCKERFILE" "$@" "$REPO_ROOT"; then
    printf 'expected frontend Docker build to fail for %s DEPLOY_SHA\n' "$label" >&2
    exit 1
  fi
}

docker build --target runner -f "$DOCKERFILE" \
  --build-arg "DEPLOY_SHA=$VALID_SHA" \
  -t "$TEST_IMAGE" \
  "$REPO_ROOT"
image_built=true

docker run --rm --entrypoint sh -e "DEPLOY_SHA=$VALID_SHA" "$TEST_IMAGE" -c '
  actual=$(cat /usr/share/nginx/html/version.txt)
  [ "$actual" = "$DEPLOY_SHA" ]
  [ "$(wc -l < /usr/share/nginx/html/version.txt)" -eq 1 ]
  [ "$(wc -c < /usr/share/nginx/html/version.txt)" -eq 41 ]
'

SHORT_SHA=0123456789abcdef0123456789abcdef0123456
UPPERCASE_SHA=0123456789ABCDEF0123456789abcdef01234567
MALFORMED_EXTRA_LINE=$(printf '%s\n%s' "$VALID_SHA" 'not-a-sha')
TWO_VALID_SHAS=$(printf '%s\n%s' "$VALID_SHA" "$SECOND_VALID_SHA")

expect_build_failure missing
expect_build_failure short --build-arg "DEPLOY_SHA=$SHORT_SHA"
expect_build_failure uppercase --build-arg "DEPLOY_SHA=$UPPERCASE_SHA"
expect_build_failure malformed-extra-line --build-arg "DEPLOY_SHA=$MALFORMED_EXTRA_LINE"
expect_build_failure two-valid-SHA --build-arg "DEPLOY_SHA=$TWO_VALID_SHAS"

printf 'front version image contract tests passed\n'
