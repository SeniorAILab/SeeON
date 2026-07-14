# Frontend agent rules — Vite 5 + React 18 + TypeScript strict dashboard (run/boot/flow in root AGENTS.md)

## Layout

```
front/src/
├── features/            # feature folders (monitor, admin-events, dashboard):
│                        # components/hooks/pages/services/stores + index.ts public API
├── services/
│   ├── api/             # endpoint mappers: backend DTO validation + domain mapping
│   └── *.ts             # service workflows
├── types/               # index.ts = frontend type mirror of PRD/API contract
├── pages/ components/   # views (shared/cross-feature only; see Guards)
├── hooks/ stores/       # reusable hooks and zustand state (shared/cross-feature only)
├── lib/                 # utilities
├── data/                # inactive fixtures for reversibly hidden pages only
├── router.tsx main.tsx  # entry
└── test/
```

See `src/AGENTS.md` before changing frontend application code.

## Guards
- Feature-internal code under `features/<name>/**` is imported from outside the
  feature only via that feature's `index.ts` public API. Shared/cross-feature
  code (types, stores such as `monitorStore`, `authStore`, `facilityStore`,
  `uiStore`, `components/ui`, `components/status/**`, layouts, `lib/*`,
  services core) stays in the type-based layers and is never moved into
  `features/`. Carve-out: `*.test.*` files may deep-import feature internals
  directly for mocking/fixtures (e.g. `vi.mock("@/features/monitor/pages/...")`);
  production code must always go through the barrel.
- Components never call the backend directly — go through `src/services/*` (the API seam).
- Backend endpoint calls live under `src/services/api/*`; service files consume endpoint functions instead of scattering `fetch()` or backend JSON casts.
- `src/types/index.ts` mirrors the PRD/API contract for frontend code.
- Dev/prod/test runtime uses the real backend API seam. Do not reintroduce
  frontend mock auth users, localStorage auth sessions, or runtime demo branches.
- Login in dev/prod is backend-owned email/password auth. It must mint the
  same httpOnly backend JWT cookie and restore via `/api/v1/auth/me`. Do not
  reintroduce frontend mock auth users or localStorage auth sessions.
- The fixture island (`src/data/mockData.ts`, `src/services/db.ts`, `src/services/adminService.ts`) is DELETED. Never reintroduce runtime mock/fixture islands; new or reactivated pages must wire to the real backend.
- `strictPort` 3000 (ADR); pnpm only, never an npm lockfile.

## Run
- test: `pnpm --filter front test`.
- lint: `pnpm --filter front lint` (check) / `pnpm --filter front lint:fix` (autofix). Convention: ADR.
