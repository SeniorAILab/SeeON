#!/usr/bin/env sh
# shellcheck disable=SC2016 # Literal Jenkins/deploy variables are contract fixtures.
set -eu

REPO_ROOT=$(CDPATH='' cd -- "$(dirname "$0")/../.." && pwd)
JENKINSFILE=$REPO_ROOT/Jenkinsfile
DEPLOY=$REPO_ROOT/scripts/deploy/iwinv-deploy.sh
CI_GATE=$REPO_ROOT/scripts/release/verify-github-ci-gate.sh
READINESS=$REPO_ROOT/scripts/deploy/iwinv-overlap-readiness.sh
LIVE_MEDIA_VOLUME=$REPO_ROOT/scripts/deploy/verify-live-event-media-volume.sh

fail() { printf '%s\n' "$1" >&2; exit 1; }
assert_contains() { case "$1" in *"$2"*) ;; *) fail "missing contract fragment: $2" ;; esac; }
assert_not_contains() { case "$1" in *"$2"*) fail "forbidden contract fragment: $2" ;; *) ;; esac; }
assert_order() {
  first=$(printf '%s\n' "$1" | grep -n -F "$2" | sed -n '1s/:.*//p')
  second=$(printf '%s\n' "$1" | grep -n -F "$3" | sed -n '1s/:.*//p')
  [ -n "$first" ] && [ -n "$second" ] && [ "$first" -lt "$second" ] || fail "expected '$2' before '$3'"
}

[ -f "$CI_GATE" ] || fail 'GitHub ci-gate verifier is required'
[ -f "$READINESS" ] || fail 'overlap release readiness gate is required'
jenkins=$(cat "$JENKINSFILE")
deploy=$(cat "$DEPLOY")

assert_contains "$jenkins" 'git@github.com:SeniorAILab/SeeON.git'
assert_not_contains "$jenkins" 'git@github.com:SeniorAILab/eldercare-fall-ai.git'
assert_contains "$jenkins" 'stage('\''Verify GitHub CI gate'\'')'
assert_contains "$jenkins" 'sh scripts/release/verify-github-ci-gate.sh "$RELEASE_SHA"'
assert_contains "$jenkins" 'stage('\''Validate release inputs'\'')'
assert_contains "$jenkins" 'sh scripts/deploy/iwinv-overlap-readiness.sh --pre-build "$RELEASE_SHA"'
assert_contains "$jenkins" 'stage('\''Build API ingress'\'')'
assert_contains "$jenkins" '--tag "eldercare-api-ingress:$RELEASE_SHA" --file infra/api-ingress/Dockerfile .'
assert_contains "$jenkins" 'sh infra/api-ingress/nginx-config.test.sh'
assert_contains "$jenkins" 'docker run --rm --entrypoint nginx "eldercare-api-ingress:$RELEASE_SHA" -t'
assert_contains "$jenkins" 'sh scripts/deploy/iwinv-overlap-readiness.sh --pre-deploy "$RELEASE_SHA"'
assert_contains "$jenkins" 'sh scripts/deploy/iwinv-deploy.sh --sha "$RELEASE_SHA"'
assert_not_contains "$jenkins" 'EVENT_MEDIA_BACKUP_DESTINATION'
assert_not_contains "$jenkins" 'EVENT_MEDIA_CLIP_VOLUME'
assert_not_contains "$jenkins" 'event-media-backup.sh'
assert_order "$jenkins" "stage('Verify GitHub CI gate')" "stage('Configure Buildx')"
assert_order "$jenkins" "stage('Validate release inputs')" "stage('Build backend')"
assert_order "$jenkins" "stage('Build API ingress')" "stage('Deploy')"
[ -f "$LIVE_MEDIA_VOLUME" ] || fail 'live event media volume gate is required'
live_media_volume=$(cat "$LIVE_MEDIA_VOLUME")
assert_contains "$live_media_volume" 'repo_clips'
assert_not_contains "$live_media_volume" 'EVENT_MEDIA_CLIP_VOLUME'
assert_not_contains "$live_media_volume" 'docker volume rm'
assert_not_contains "$live_media_volume" 'docker volume prune'
assert_not_contains "$live_media_volume" 'docker system prune'
assert_contains "$deploy" 'sh "$APP_DIR/scripts/deploy/verify-live-event-media-volume.sh"'
assert_not_contains "$deploy" 'MEDIA_RECEIPT'
assert_not_contains "$deploy" 'seeon-event-media-backup-receipt-v1'

# First schema-2 writer remains transitional and deploy activation occurs only
# after health/CORS/SSE/auth/Edge receipts and all exact image IDs are verified.
assert_contains "$deploy" 'API_INGRESS_IMAGE=eldercare-api-ingress:$SHA'
assert_contains "$deploy" 'FRONT_IMAGE=eldercare-front:$SHA'
assert_contains "$deploy" 'embedded_front_image'
assert_contains "$deploy" 'verify_overlap_receipts'
assert_order "$deploy" 'verify_overlap_receipts' 'verify_image_ids'
assert_order "$deploy" 'verify_edge_continuity' 'activate_manifest "$RELEASE_DIR/$SHA.json"'

printf '%s\n' 'overlap release integration contract tests passed'
