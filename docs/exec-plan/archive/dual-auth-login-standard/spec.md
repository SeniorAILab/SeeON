---
slug: dual-auth-login-standard
status: done
date: 2026-06-23
author: codex
---

# Spec

## Goal

Connect the frontend login frame to real backend email/password login and Kakao
OAuth, using backend-owned sessions for both paths.

## Requirements

- The login page must offer both email/password login and Kakao OAuth.
- Email/password login must call a backend endpoint and receive the same session
  cookie model used by Kakao OAuth.
- Frontend code must not reintroduce mock users, localStorage auth sessions, or
  frontend-issued tokens.
- The backend data model must be able to represent Kakao users and email users
  without fake provider IDs.
- Existing Kakao OAuth and facility onboarding behavior must remain intact.

## Non-goals

- Do not replace all remaining mock dashboard/admin data in this slice.
- Do not add signup, password reset, MFA, or account-management flows.
- Do not change Kakao app credentials or redirect URI configuration.
