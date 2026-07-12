#!/usr/bin/env sh
set -eu

REPO_ROOT=$(CDPATH='' cd -- "$(dirname "$0")/../.." && pwd)
SCRIPT=$REPO_ROOT/scripts/deploy/iwinv-resolve-release.sh
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT HUP INT TERM

assert_contains() { case "$1" in *"$2"*) ;; *) printf 'missing expected output: %s\n%s\n' "$2" "$1" >&2; exit 1;; esac; }
assert_failure() { [ "$1" -ne 0 ] || { printf 'command unexpectedly passed\n' >&2; exit 1; }; }

fixture() {
  name=$1
  WORK=$TMP/$name/work
  REMOTE=$TMP/$name/remote.git
  RELEASES=$TMP/$name/releases
  mkdir -p "$TMP/$name" "$RELEASES"
  git init --bare "$REMOTE" >/dev/null
  git init "$WORK" >/dev/null
  git -C "$WORK" checkout -b main >/dev/null
  git -C "$WORK" config user.email release-test@example.com
  git -C "$WORK" config user.name 'Release Test'
  printf '%s\n' "$name" > "$WORK/release.txt"
  git -C "$WORK" add release.txt
  git -C "$WORK" commit -m initial >/dev/null
  git -C "$WORK" remote add origin "$REMOTE"
  git -C "$WORK" push -u origin main >/dev/null
}

run_resolver() {
  (
    cd "$WORK"
    GIT_REMOTE=origin RELEASES_DIR="$RELEASES" sh "$SCRIPT"
  )
}

assert_red() {
  set +e
  output=$(run_resolver); status=$?
  set -e
  assert_failure "$status"
}

manifest() {
  printf '{"sha":"%s","backend_image":"eldercare-backend:%s","backend_image_id":"sha256:backend-%s","front_image":"eldercare-front:%s","front_image_id":"sha256:front-%s","compose_sha256":"compose","env_sha256":"env","pre_migration_dump":"test.dump","timestamp":"2026-07-12T00:00:00Z"}\n' "$1" "$1" "$1" "$1" "$1"
}

add_lightweight_tag() {
  git -C "$WORK" tag "$1" "$2"
  git -C "$WORK" push origin "refs/tags/$1" >/dev/null
}

add_annotated_tag() {
  git -C "$WORK" tag -a "$1" "$2" -m "$1"
  git -C "$WORK" push origin "refs/tags/$1" >/dev/null
}

# Lightweight tags resolve directly to the tagged commit.
fixture lightweight
main_sha=$(git -C "$WORK" rev-parse HEAD)
add_lightweight_tag v1.2.3 "$main_sha"
output=$(run_resolver)
assert_contains "$output" 'RELEASE_TAG=v1.2.3'
assert_contains "$output" "RELEASE_SHA=$main_sha"
assert_contains "$output" 'NO_OP=0'

# Annotated tags must use their peeled commit OID rather than the tag object OID.
fixture annotated
main_sha=$(git -C "$WORK" rev-parse HEAD)
add_annotated_tag v1.2.3 "$main_sha"
output=$(run_resolver)
assert_contains "$output" "RELEASE_SHA=$main_sha"
[ "$(git -C "$WORK" rev-parse v1.2.3)" != "$main_sha" ]

# Tags pointing at a blob are rejected after peeled-OID selection.
fixture non-commit
printf 'blob\n' > "$WORK/blob.txt"
blob_sha=$(git -C "$WORK" hash-object -w blob.txt)
add_annotated_tag v1.2.3 "$blob_sha"
assert_red

# Prerelease and non-semver tags do not participate in stable release selection.
fixture ignored-tags
main_sha=$(git -C "$WORK" rev-parse HEAD)
add_lightweight_tag v1.2.3 "$main_sha"
add_lightweight_tag v9.9.9-rc.1 "$main_sha"
add_lightweight_tag release-99 "$main_sha"
output=$(run_resolver)
assert_contains "$output" 'RELEASE_TAG=v1.2.3'

# Version sorting is semantic rather than lexical.
fixture version-sort
main_sha=$(git -C "$WORK" rev-parse HEAD)
add_lightweight_tag v0.9.0 "$main_sha"
add_lightweight_tag v0.10.0 "$main_sha"
output=$(run_resolver)
assert_contains "$output" 'RELEASE_TAG=v0.10.0'

# No stable tag is a hard failure.
fixture no-tags
assert_red

# A stable tag on a commit outside main is a hard failure.
fixture off-main
git -C "$WORK" checkout -b release-only >/dev/null
git -C "$WORK" commit --allow-empty -m off-main >/dev/null
off_main_sha=$(git -C "$WORK" rev-parse HEAD)
add_lightweight_tag v1.2.3 "$off_main_sha"
git -C "$WORK" checkout main >/dev/null
assert_red

# Missing current.json is a bootstrap deployment, not a no-op.
fixture release-pointer
main_sha=$(git -C "$WORK" rev-parse HEAD)
add_lightweight_tag v1.2.3 "$main_sha"
output=$(run_resolver)
assert_contains "$output" 'NO_OP=0'

# A valid pointer identical to its immutable manifest is a no-op only for the same release.
manifest "$main_sha" > "$RELEASES/$main_sha.json"
cp "$RELEASES/$main_sha.json" "$RELEASES/current.json"
output=$(run_resolver)
assert_contains "$output" 'NO_OP=1'

# A valid pointer for another release proceeds with deployment.
other_sha=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
manifest "$other_sha" > "$RELEASES/$other_sha.json"
cp "$RELEASES/$other_sha.json" "$RELEASES/current.json"
output=$(run_resolver)
assert_contains "$output" 'NO_OP=0'

# Malformed pointers, missing image fields, missing immutable manifests, and mismatched bytes are red.
printf '{"sha":\n' > "$RELEASES/current.json"
assert_red
printf '{"sha":"%s"}\n' "$main_sha" > "$RELEASES/current.json"
assert_red
manifest "$main_sha" > "$RELEASES/current.json"
rm -f "$RELEASES/$main_sha.json"
assert_red
manifest "$main_sha" > "$RELEASES/$main_sha.json"
printf '\n' >> "$RELEASES/current.json"
assert_red

printf 'iwinv resolve release contract tests passed\n'
