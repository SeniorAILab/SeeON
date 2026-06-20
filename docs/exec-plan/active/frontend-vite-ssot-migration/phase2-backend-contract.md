# Phase 2 Backend-Matching Contract — DEFERRED

This document records the deferred Phase 2 backend-matching contract for the frontend Vite SSOT migration. Phase 1, stacked on PR #257, only makes the Vite 5 + React 18 app the canonical `front/` implementation, keeps it mock-driven, and leaves backend/ML behavior unchanged.

Every endpoint, requirement, and integration item below is **DEFERRED** and **not implemented in Phase 1**.

## Deferred endpoint ↔ service map

| Frontend service | Deferred backend contract | Phase 1 status |
|---|---|---|
| `authService` | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`; email/password login with JWT Bearer authentication. | DEFERRED — not implemented in Phase 1. |
| `dashboardService` | `GET /api/facilities/:id/dashboard`, `GET /api/spaces/:id/status`, `GET /api/spaces/:id/events`. | DEFERRED — not implemented in Phase 1. |
| `eventService` | `POST /api/events/:id/acknowledge`, `POST /api/events/:id/action-note`. | DEFERRED — not implemented in Phase 1. |
| `residentService` | `GET /api/facilities/:id/focus-residents`, `GET /api/residents/:id`, `POST /api/residents/:id/action`. | DEFERRED — not implemented in Phase 1. |
| `zoneService` | `/api/spaces/:id/zones`, `/api/assignments`. | DEFERRED — not implemented in Phase 1. |
| `adminService` | `/api/floors`, `/api/spaces`, `/api/facilities`, `/api/alert-rules`. | DEFERRED — not implemented in Phase 1. |
| `aiIngestService` | `POST /api/ai/detection-result` for frontend demo simulation; canonical ML ingest remains `/ingest` with HMAC. | DEFERRED — not implemented in Phase 1. |
| `kakaoService` | `POST /api/alerts/kakao/send`, reusing the existing backend fan-out model. | DEFERRED — not implemented in Phase 1. |
| `videoService` | `GET /api/events/:id/video`, `GET /api/videos/:id/signed-url`, `POST /api/videos/:id/access-log`. | DEFERRED — not implemented in Phase 1. |

## Deferred hard requirements

- **DEFERRED — real email/password JWT login:** backend must provide working email/password authentication and JWT Bearer flows for the frontend auth service. Not implemented in Phase 1.
- **DEFERRED — Kakao product-level registration and send:** backend must support real Kakao user registration and alert sending by reusing the existing fan-out decisions in ADR-042, ADR-044, ADR-052, and ADR-053. Not implemented in Phase 1.
- **DEFERRED — frontend domain contract:** frontend `types/index.ts` is the canonical Phase 2 domain input; backend domain mapping should refine ADR-031 and ADR-037 where the implemented API contract requires it. Not implemented in Phase 1.
- **DEFERRED — hybrid auth refinement:** email/password JWT login plus Kakao registration/send must refine the ADR-033 auth boundary without leaking Kakao tokens to the browser. Not implemented in Phase 1.
- **DEFERRED — ingest mapping:** canonical ML `/ingest` HMAC input must map into backend `DetectionEvent`, `SpaceStatus`, and delivery side effects; `POST /api/ai/detection-result` remains a frontend demo simulation boundary unless/until explicitly implemented. Not implemented in Phase 1.
- **DEFERRED — realtime SSE plus ticket:** SSE and ticket behavior from ADR-034 remain deferred until the backend-matching API contract is implemented. Not implemented in Phase 1.
