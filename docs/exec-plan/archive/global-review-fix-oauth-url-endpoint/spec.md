---
slug: global-review-fix-oauth-url-endpoint
title: "Global Review Fix - Kakao OAuth URL Endpoint"
type: spec
date: 2026-06-13
owner: gobeumsu
issue: 96
status: done
---

# Spec: Global Review Fix - Kakao OAuth URL Endpoint

## Requirement

Unauthenticated callers must not be able to retrieve a raw Kakao OAuth authorization URL,
the OAuth client identifier query parameter, or the configured Kakao REST API key from
backend HTTP responses.

## Scope

- Change the backend `POST /api.alerts/kakao/oauth/authorization-urls` behavior.
- Add regression coverage proving unauthenticated responses contain no raw authorize URL,
  no OAuth client identifier query marker, and no configured REST API key.
- Preserve the CLI OAuth bootstrap behavior and its redaction tests.

## Non-goals

- Changing Kakao token exchange behavior.
- Changing alert delivery policy or ML alert flow.
