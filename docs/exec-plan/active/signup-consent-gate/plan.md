---
slug: signup-consent-gate
status: active
date: 2026-07-01
owner: codex
---

# Signup Consent Gate Plan

## Decisions

- Implement the MVP consent step in the existing `SignupPage` rather than adding a new route.
- Keep consent frontend-gated only for this slice; do not change backend DTOs or database schema.
- Preserve the existing register payload and backend session behavior.
- Add a local `front/DESIGN.md` extracted from current frontend tokens before UI changes.

## Work Plan

1. Add failing frontend tests for the consent gate.
   - Missing terms/privacy acknowledgements must prevent `register`.
   - Both acknowledgements must allow the existing successful signup flow.

2. Update `front/src/pages/SignupPage.tsx`.
   - Add two controlled required checkboxes.
   - Include short MVP terms/privacy copy.
   - Include both checkbox states in `canSubmit` and submit guard.
   - Keep phone/email required and the existing register payload unchanged.

3. Verify targeted behavior.
   - Run the targeted `LoginPage.test.tsx` suite and capture RED then GREEN evidence.
   - Run frontend typecheck/lint where feasible.
   - Run browser QA against `/signup` and capture screenshot/action evidence.

4. Review and record evidence.
   - Re-read the diff for scope drift.
   - Record ULW criteria evidence with cleanup receipts.
   - Run final reviewer gate required by the ULW final story.

## QA Scenarios

- C001 happy path: Playwright opens `/signup`, fills all required fields, checks both acknowledgements, confirms submit becomes enabled, and captures the rendered page.
- C002 edge path: targeted Vitest/RTL proves valid text fields without acknowledgements do not call `register`; browser QA captures disabled submit before agreements.
- C003 regression: targeted tests prove login still renders and `/auth/register` payload remains `{ name, email, password, phone, facilityName }`.

## Guardrails

- Do not change backend auth service behavior.
- Do not add legal/audit persistence in this slice.
- Do not modify unrelated active invite-flow plan body.
- Do not overwrite pre-existing `.codex/config.toml` or active auth spec changes.
