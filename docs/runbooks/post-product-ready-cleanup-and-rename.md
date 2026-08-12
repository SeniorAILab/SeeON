# Post-PRODUCT_READY cleanup and repository rename

This runbook is blocked until the production artifact passes the
[PRODUCT_READY checker](../../scripts/release/check-product-ready.mjs) under the
[cutover runbook](product-ready-cutover.md). It covers plan Tasks 14-16; it does
not authorize execution during Task 8.

GitHub documents redirect behavior and recommends updating consumers after a
[repository rename](https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository).

## Gate receipt

```bash
node scripts/release/check-product-ready.mjs \
  .omo/evidence/seeon-backend-cutover-migration/task-13/product-ready/product-ready.json
```

Stop unless exit is zero, `artifactKind` is `production`, and all 24 rows are
PASS. Rollback metadata is advisory and does not gate cleanup. Never use
`--allow-synthetic` here.

## Remove embedded frontend ownership

Create the dedicated cleanup branch and remove only embedded frontend ownership:
`front/`, front workspace/scripts/CI/build, Compose front service, Jenkins front
stage, `FRONT_IMAGE`, host-built `VITE_*`, and stale documentation. Preserve
backend, standalone API ingress, database/media safety, Edge routes, schema-1 and
transitional schema-2 readers, previous frontend image retention, and old-release
rollback.

Before merge, subscribe to the exact cleanup PR check suite SHA. The reviewed
trigger command pushes only the cleanup branch; direct `main` push is forbidden.

```bash
node scripts/release/await-exact-signal.mjs \
  --timeout-ms 1800000 \
  --ready-json '{"signal":"github-check-suite","state":"SUBSCRIBED","repository":"SeniorAILab/SeeON","sha":"<cleanup-sha>"}' \
  --signal-json '{"signal":"github-check-suite","state":"SUCCESS","repository":"SeniorAILab/SeeON","sha":"<cleanup-sha>","requiredCheck":"ci-gate"}' \
  --subscribe-command "$GITHUB_CHECK_EVENT_STREAM_COMMAND" \
  --trigger-command "$GITHUB_REVIEWED_BRANCH_PUSH_COMMAND" \
  > "$EVIDENCE_ROOT/evidence/cleanup-ci.json"
```

The exact event plus independent review is required before merge. A missing
reader, ingress, rollback fixture, residue guard, or retained image is a hard
failure.

## Backend-only deployment and burn-in

Subscribe to the exact Jenkins build number and release SHA before issuing the
reviewed release trigger. The resulting schema-2 manifest must contain backend
and API ingress only.

```bash
node scripts/release/await-exact-signal.mjs \
  --timeout-ms 1800000 \
  --ready-json '{"signal":"jenkins-release","state":"SUBSCRIBED","build":"<build-number>","sha":"<40-hex-sha>"}' \
  --signal-json '{"signal":"jenkins-release","state":"SUCCESS","build":"<build-number>","sha":"<40-hex-sha>","manifestSchema":"2","frontImagePresent":false}' \
  --subscribe-command "$JENKINS_RELEASE_EVENT_STREAM_COMMAND" \
  --trigger-command "$REVIEWED_RELEASE_TRIGGER_COMMAND" \
  > "$EVIDENCE_ROOT/evidence/backend-only-deploy.json"
```

The monitoring adapter must subscribe to exact service, product, and Edge
signals before deployment. It emits a completion object only after the approved
burn-in duration has elapsed with every budget continuously green; it emits a
failure object immediately on a regression. The helper deadline is longer than
the approved duration and is never used as success.

```bash
node scripts/release/await-exact-signal.mjs \
  --timeout-ms 3600000 \
  --ready-json '{"signal":"backend-only-burnin","state":"SUBSCRIBED","sha":"<40-hex-sha>"}' \
  --signal-json '{"signal":"backend-only-burnin","state":"COMPLETE","sha":"<40-hex-sha>","auth":true,"sse":true,"media":true,"rbac":true,"database":true,"edge":true}' \
  --subscribe-command "$BACKEND_ONLY_BURNIN_EVENT_STREAM_COMMAND" \
  > "$EVIDENCE_ROOT/evidence/backend-only-burnin.json"
```

Do not execute or wait on a rollback rehearsal. Preserve the previous
transitional manifest, retained images, and database recovery artifacts for
fix-forward operations. Only after legacy retirement and smoke-green may
`AUTH_COOKIE_SECURE=true` be pinned.

## Rename inventory

Before mutation, record these non-sensitive identities:

- current public repository `SeniorAILab/SeeON`, main SHA, tags, releases, issue
  and PR counts, permissions, and branch settings;
- Actions repository identity and workflow references;
- Jenkins checkout URL, job seed, job SCM, webhook target, and deploy key scope;
- local task-owned remotes;
- OCI labels, badges, docs, contracts, submodules, reusable workflow `uses`, and
  release tooling references.

Never create a copied or filtered repository. Rename the existing public
repository only after the backend-only burn-in passes.

## Rename and repoint

Subscribe to the exact GitHub repository audit event before the reviewed rename.

```bash
node scripts/release/await-exact-signal.mjs \
  --timeout-ms 600000 \
  --ready-json '{"signal":"github-repository-rename","state":"SUBSCRIBED","old":"SeniorAILab/SeeON","new":"SeniorAILab/SeeON-Backend"}' \
  --signal-json '{"signal":"github-repository-rename","state":"RENAMED","old":"SeniorAILab/SeeON","new":"SeniorAILab/SeeON-Backend"}' \
  --subscribe-command "$GITHUB_RENAME_EVENT_STREAM_COMMAND" \
  --trigger-command "$GITHUB_REVIEWED_RENAME_COMMAND" \
  > "$EVIDENCE_ROOT/evidence/repository-rename.json"
```

Immediately update Jenkins checkout/job/webhook, task-owned remotes, OCI labels,
docs, badges, and active contract references to
`https://github.com/SeniorAILab/SeeON-Backend`. Historical migration prose may
retain the old name only when explicitly labeled as redirect history.

Subscribe to the exact Jenkins checkout SHA before the reviewed job/config
repoint. This proves the consumer uses the new canonical URL rather than relying
on redirect behavior.

```bash
node scripts/release/await-exact-signal.mjs \
  --timeout-ms 900000 \
  --ready-json '{"signal":"jenkins-checkout","state":"SUBSCRIBED","repository":"SeniorAILab/SeeON-Backend","sha":"<40-hex-sha>"}' \
  --signal-json '{"signal":"jenkins-checkout","state":"SUCCESS","repository":"SeniorAILab/SeeON-Backend","sha":"<40-hex-sha>"}' \
  --subscribe-command "$JENKINS_CHECKOUT_EVENT_STREAM_COMMAND" \
  --trigger-command "$JENKINS_REVIEWED_REPOINT_COMMAND" \
  > "$EVIDENCE_ROOT/evidence/jenkins-repoint.json"
```

## Rename acceptance

Read-only checks must prove:

- new canonical repo is public and retains the exact main SHA, history, tags,
  releases, issues, PRs, permissions, and branch settings;
- old web and Git URLs redirect while all active consumers use the new URL;
- Actions uses the new identity and required checks pass;
- Jenkins checks out the exact SHA from the new URL;
- product domains, auth, SSE, media, RBAC, database, and Edge remain green;
- no active `SeniorAILab/SeeON` reference remains outside explicit redirect
  history.

A permission, collision, webhook, checkout, check, or active-reference failure
blocks closure. Do not delete rollback manifests, images, or database/media
safety receipts during rename cleanup.
