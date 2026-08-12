#!/bin/sh
set -eu

REPO_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
DOCKERFILE="$REPO_ROOT/backend/Dockerfile"

assert_contains() {
  grep -F "$2" "$1" >/dev/null || { echo "missing: $2" >&2; exit 1; }
}
assert_not_contains() {
  if grep -F "$2" "$1" >/dev/null; then echo "unexpected: $2" >&2; exit 1; fi
}

assert_contains "$DOCKERFILE" 'prisma/reset-admin-password.ts'
assert_contains "$DOCKERFILE" 'src/auth/password.ts'
assert_contains "$DOCKERFILE" 'src/auth/password-policy.ts'
assert_contains "$DOCKERFILE" 'COPY --from=build /app/backend/dist-tools ./dist-tools'
assert_contains "$DOCKERFILE" 'CMD ["node", "dist/main"]'
assert_not_contains "$DOCKERFILE" 'CMD ["node", "dist-tools/prisma/reset-admin-password.js"]'

echo 'backend Docker maintenance-command contract: PASS'
