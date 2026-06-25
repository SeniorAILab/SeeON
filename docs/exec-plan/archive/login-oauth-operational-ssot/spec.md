---
slug: login-oauth-operational-ssot
author: codex
date: 2026-06-25
---

# Login/OAuth Operational SSOT Spec

## Problem

Real login must work through the frontend and backend, but repeated failures are
being traced to OAuth/operator setup drift rather than a missing auth route.
The repository already has backend-owned email/password and Kakao OAuth login,
but it lacks a single current checklist that ties the live public origin,
Kakao Developers settings, backend env values, frontend proxy expectations, and
verification evidence together.

## Target Outcome

Create one backend ADR and one narrow config fix that make the operational gate
explicit for real email/password login and Kakao OAuth:

- public website origin: `http://101.79.18.95`
- backend-owned Kakao callback and session cookie model
- Kakao Developers setup checklist and permission/consent scope checklist
- env/proxy/session restore invariants
- fast failure signatures and verification commands

## Scope

- Add a backend ADR under `docs/decisions/backend/`.
- Update `docs/decisions/README.md` so the new ADR is discoverable.
- Pass optional Kakao OAuth env values through Compose when research proves a
  direct deployment defect.

## Non-Goals

- Do not implement a new signup API.
- Do not change Kakao token/session architecture from ADR-033/042/051/069.
- Do not add a DOCX/Google Docs artifact; this is a repo ADR.
