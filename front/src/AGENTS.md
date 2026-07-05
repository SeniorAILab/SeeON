# Front src agent rules - Vite React application code

## Overview
`front/src/**` owns the product dashboard UI, frontend domain types, services,
inactive fixtures for reversibly hidden pages, and tests for the Vite React app.

## Where to look

| Task | Location | Notes |
| --- | --- | --- |
| App entry | `main.tsx`, `router.tsx` | React bootstrap and route tree. |
| Feature modules | `features/<name>/` | Bulletproof-react style feature folders (`monitor`, `admin-events`, `dashboard`); each has its own `components/`, `hooks/`, `pages/`, `services/`, `stores/` as needed, plus an `index.ts` public API. |
| Backend access | `services/api/` | Endpoint mappers and backend DTO validation. |
| Workflows | `services/` | Service-level orchestration over endpoint functions. |
| Domain types | `types/index.ts` | Frontend type mirror of the PRD/API contract. |
| Pages | `pages/` | Route-level UI surfaces not owned by a feature (shared/cross-feature pages). |
| Reusable UI | `components/` | Shared/cross-feature dashboard widgets, layout, status board, UI primitives. Feature-specific UI lives under `features/<name>/components/`. |
| State containers | `stores/` | Zustand state containers for shared/cross-feature state (e.g. `monitorStore`, `authStore`, `facilityStore`, `uiStore`). Feature-scoped state lives under `features/<name>/stores/`. |
| Reusable hooks | `hooks/` | Reusable React hooks over services, state, and route context, shared across features (e.g. `useActiveFacilityId`). Feature-scoped hooks live under `features/<name>/hooks/`. |
| Roles | `lib/roles.ts` | Frontend mirror for PRD role labels, permission helpers, and default routes. |
| Tests | `test/`, `*.test.tsx`, `*.test.ts` | Vitest/jsdom setup and colocated specs. |

Terminology: dashboard = route/read-model/API, monitor = physical kiosk device/settings, status = reusable board widgets.
## Conventions

- Feature-internal code under `features/<name>/**` is imported by consumers
  outside that feature only via the feature's `index.ts` public API (e.g.
  `import { useMonitorSettingsStore } from "@/features/monitor"`). Code
  internal to a feature may reference its own files directly. Shared code
  (types, cross-feature stores, `components/ui`, `components/status/**`,
  layouts, `lib/*`, services core, `hooks/useActiveFacilityId`) stays in the
  type-based layers above and must not move into `features/`.
- Components never call backend endpoints directly. Use `services/*`.
- Endpoint functions live under `services/api/*`; higher services consume them.
- Keep backend DTO parsing/mapping at the service seam, not inside components.
- Runtime uses the real backend API seam. Do not reintroduce frontend mock auth
  users, localStorage auth sessions, or runtime demo branches.
- `data/mockData.ts`, `services/db.ts`, and their fixture service island are
  preserved only for reversibly hidden pages. They are not a runtime backend
  substitute; wire reactivated pages to the real backend or delete the fixture
  island with those pages.
- Auth is backend-owned. Restore identity through `/api/v1/auth/me`; do not add
  frontend mock users or localStorage auth sessions.
- Use the `@/*` alias for source imports where it improves readability.
- `_`-prefixed variables are the intentional-unused convention.
- Tests run with Vitest/jsdom and cleanup in `test/setup.ts`.

## Anti-patterns

- No direct `fetch()` from components or pages.
- No direct import of backend JSON shapes into UI components.
- No localStorage session/auth source of truth.
- No staff-facing UI that exposes model scores, camera IDs, or model
  explanations unless a product rule explicitly allows it.
- No face recognition, enrollment, embeddings, photo upload, or face-based
  identification features.
