---
slug: backend-direct-login-flow
status: active
date: 2026-06-23
author: codex
---

# Spec

## Goal

Make the frontend login surface dev/prod backend-direct instead of PoC mock-driven.

## Requirements

- The login page must present Kakao OAuth as the login path.
- Demo email/password login must not be part of the dev/prod login surface.
- Frontend session restore must use backend `/auth/session`.
- Kakao callback users without a facility must have a frontend `/onboarding` route.
- Onboarding must call backend `POST /api/facilities`, refresh frontend auth state, and route to the user's default page.
- Tests may use HTTP-level fakes, but app code must not depend on mock auth for dev/prod.

## Non-goals

- Do not remove every remaining mock-backed dashboard/admin service in this slice.
- Do not introduce a password login endpoint.
- Do not change backend Kakao OAuth semantics.
