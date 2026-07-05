# Rule: Front admin CRUD pages

> **Status: SUPERSEDED (Next.js-era rule).** This rule described the legacy Next.js
> dashboard: admin pages under `front/src/app/admin/**` built on a shared
> `front/src/lib/useCrud.ts` hook. The frontend is now **Vite + React** (ADR).
> Admin pages live under `front/src/pages/admin/`, and there is **no `useCrud.ts`** —
> the Vite front talks to the backend through the typed service layer in
> `front/src/services/*` (e.g. `adminService.ts`, `residentService.ts`) via the
> shared `apiClient.ts` (`request()` wrapper, `VITE_USE_MOCK`).
> The original Next.js body is recoverable from git history.

## Current (Vite) guidance

Until a canonical Vite admin-CRUD abstraction is introduced, follow the existing
patterns already in the repo:

- **Pages** live in `front/src/pages/admin/` and own their entity-specific form
  fields and JSX.
- **Data access** goes through `front/src/services/*` (one service per resource),
  which wrap `front/src/services/apiClient.ts` `request()`; never call `fetch`
  ad-hoc from a component.
- **Casing**: the backend product API (`/api/*`) returns camelCase matching
  `front/src/types/index.ts` (the frontend type mirror) — map at the service boundary, not
  scattered across components.
- **Mock vs real**: `apiClient.ts` defaults to real backend mode when
  `VITE_USE_MOCK` is unset or `false`; explicit `VITE_USE_MOCK=true` is the mock
  runtime. Remaining per-resource mock→real wiring is tracked as the
  Front-Based API Frame AC10 follow-up.

> A reusable Vite admin-CRUD hook/convention (the Vite analogue of the retired
> `useCrud`) is **deferred** until the front mock→real wiring lands; introduce it
> only when repeated CRUD-page duplication makes the abstraction pay for itself.
