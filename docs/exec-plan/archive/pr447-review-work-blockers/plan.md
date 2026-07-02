---
slug: pr447-review-work-blockers
status: done
owner: codex
created: 2026-07-02
---

# PR #447 Review-Work Blockers

## Goal

Resolve the `review-work` blockers found after PR #447 was opened, without expanding the PR beyond the Nokyang seed/role split and no-mock E2E proof scope.

## Scope

- Carry the selected facility scope through SSE/EventSource for facility-less `SUPER_ADMIN` users.
- Prevent route-scoped dashboard children from firing facility-scoped API requests before `currentFacilityId` is set.
- Remove active layout facility fallback to frontend mock data; layout facility names/options must come from backend `/facilities`.
- Add focused regression tests for the route-scope and SSE facility-scope contracts.
- Keep the real RTSP proof script reproducible while redacting sensitive URL userinfo in evidence and documenting the intentional single-file size.

## Verification

- Frontend focused tests for API URL, route scope, and layout facility source.
- Backend guard tests for header/query facility scope.
- Typecheck/lint and targeted tests for changed frontend/backend surfaces.
- `bash -n` and `--help` for the RTSP proof script.
- Rerun failed `review-work` lanes or equivalent focused gate checks before final PR update.
