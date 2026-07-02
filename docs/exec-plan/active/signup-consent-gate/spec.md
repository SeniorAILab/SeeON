---
slug: signup-consent-gate
status: active
date: 2026-07-01
owner: codex
---

# Signup Consent Gate Spec

## Problem

The public facility-owner signup form already requires admin name, work email, password, contact phone, and facility display name. It does not require the user to pass through explicit terms and privacy consent before submitting.

## Target

- Public `/signup` remains the MVP facility tenant creation flow for the first facility `ADMIN`.
- Email and phone remain required signup fields.
- Signup requires two explicit user acknowledgements before submit:
  - Service terms acknowledgement.
  - Privacy collection/use acknowledgement.
- The terms/privacy experience stays lightweight for MVP: short inline copy on the signup page plus links/placeholders for fuller documents later.
- The frontend keeps the existing `/auth/register` payload shape: `{ name, email, password, phone, facilityName }`.

## Must Have

- Signup submit is unavailable until all text fields, password confirmation, terms acknowledgement, and privacy acknowledgement are complete.
- The form uses accessible labels for both acknowledgement controls.
- Existing password validation and backend-backed register flow remain intact.
- No resident, guardian, patient, room, diagnosis, camera, or clinical data is collected at signup.

## Must Not Have

- No separate owner/staff login page.
- No public caregiver signup.
- No role selector.
- No OTP, SMS verification, account recovery, or consent persistence in this slice.
- No backend `/auth/register` request body expansion unless a future requirement asks for consent audit storage.

## Acceptance

- Tests prove signup does not call `register` without both acknowledgements.
- Tests prove signup succeeds with both acknowledgements and preserves the existing register payload.
- Browser QA proves the real `/signup` page renders the agreement step and blocks/enables submit as expected.
