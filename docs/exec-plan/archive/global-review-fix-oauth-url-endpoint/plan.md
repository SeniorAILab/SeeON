---
slug: global-review-fix-oauth-url-endpoint
title: "Global Review Fix - Kakao OAuth URL Endpoint - Execution Plan"
type: plan
date: 2026-06-13
owner: gobeumsu
issue: 96
created-from-spec: global-review-fix-oauth-url-endpoint/spec.md
status: done
---
<!-- NOTE: plan body is immutable after finalize (first commit including this file).
     Scope change -> new slug + status: superseded-by. -->

# Plan: Global Review Fix - Kakao OAuth URL Endpoint

## Steps

1. Replace the vulnerable controller test with a regression asserting unauthenticated
   calls do not receive a raw authorization URL, OAuth client identifier query marker,
   or the configured REST key.
2. Remove or neutralize the HTTP endpoint disclosure while preserving `KakaoOAuthService`
   for the CLI OAuth bootstrap path.
3. Run focused Kakao auth tests, backend build/typecheck, no-fix lint for touched files,
   and a changed-file secret scan.
4. Write verification evidence under `.omo/evidence/kakao-fall-alert-pilot/`.

## Acceptance

- Unauthenticated `POST /api.alerts/kakao/oauth/authorization-urls` cannot disclose the
  raw Kakao authorize URL or REST key material.
- Existing CLI bootstrap tests still pass.
- Evidence artifact records command status and sanitized verification output.
