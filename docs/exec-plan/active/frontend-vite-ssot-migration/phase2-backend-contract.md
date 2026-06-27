# Phase 2 Backend-Matching Contract — DEFERRED

This document records the remaining deferred Phase 2 backend-matching contract for the frontend Vite SSOT migration. Phase 1, stacked on PR #257, only made the Vite 5 + React 18 app the canonical `front/` implementation. Since then, auth/session/facility onboarding moved to real backend mode by default; the remaining dashboard/admin/monitor service wiring is still incremental.

Items marked **DEFERRED** below are still not implemented. Auth is no longer deferred.

## Deferred endpoint ↔ service map

| Frontend service | Deferred backend contract | Phase 1 status |
|---|---|---|
| `authService` | `POST /auth/login`, `POST /auth/logout`, `GET /auth/session`, `GET /auth/kakao/login`; email/password and Kakao OAuth both mint the backend `app_session` cookie. | CURRENT — backend-direct auth is implemented. |
| `dashboardService` | `GET /api/facilities/:id/dashboard`, `GET /api/spaces/:id/status`, `GET /api/spaces/:id/events`. | DEFERRED — not implemented in Phase 1. |
| `eventService` | `POST /api/events/:id/acknowledge`, `POST /api/events/:id/action-note`. | DEFERRED — not implemented in Phase 1. |
| `residentService` | `GET /api/facilities/:id/focus-residents`, `GET /api/residents/:id`, `POST /api/residents/:id/action`. | DEFERRED — not implemented in Phase 1. |
| `zoneService` | `/api/spaces/:id/zones`, `/api/assignments`. | DEFERRED — not implemented in Phase 1. |
| `adminService` | `/api/floors`, `/api/spaces`, `/api/facilities`; alert-rules were removed and now return `404`. | DEFERRED — not implemented in Phase 1. |
| `aiIngestService` | `POST /api/ai/detection-result` for frontend demo simulation; canonical ML ingest remains `/ingest` with HMAC. | DEFERRED — not implemented in Phase 1. |
| `kakaoService` | `POST /api/alerts/kakao/send`, reusing the existing backend fan-out model. | DEFERRED — not implemented in Phase 1. |
| `videoService` | `GET /api/events/:id/video`, `GET /api/videos/:id/signed-url`, `POST /api/videos/:id/access-log`. | DEFERRED — not implemented in Phase 1. |

## Deferred hard requirements

- **CURRENT — real email/password plus Kakao login:** backend provides email/password and Kakao OAuth login, both restored through `/auth/session` with the backend session cookie. Frontend mock auth users and localStorage auth sessions remain forbidden.
- **DEFERRED — Kakao product-level registration and send:** backend must support real Kakao user registration and alert sending by reusing the existing fan-out decisions in ADR-071, ADR-044, ADR-052, and ADR-053. Not implemented in Phase 1.
- **DEFERRED — frontend domain contract:** frontend `types/index.ts` is the canonical Phase 2 domain input; backend domain mapping should refine ADR-031 and ADR-037 where the implemented API contract requires it. Not implemented in Phase 1.
- **CURRENT — hybrid auth refinement:** email/password and Kakao both use the ADR-071 backend session boundary without leaking Kakao tokens to the browser.
- **DEFERRED — ingest mapping:** canonical ML `/ingest` HMAC input must map into backend `DetectionEvent`, `SpaceStatus`, and delivery side effects; `POST /api/ai/detection-result` remains a frontend demo simulation boundary unless/until explicitly implemented. Not implemented in Phase 1.
- **DEFERRED — realtime SSE plus ticket:** SSE and ticket behavior from ADR-034 remain deferred until the backend-matching API contract is implemented. Not implemented in Phase 1.
