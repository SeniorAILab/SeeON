# Frontend agent rules — Vite 5 + React 18 + TypeScript strict dashboard (run/boot/flow in root AGENTS.md)

## Layout

```
front/src/
├── services/
│   ├── api/             # endpoint mappers: backend DTO validation + domain mapping
│   └── *.ts             # service workflows
├── types/               # index.ts = frontend type mirror of PRD/API contract
├── pages/ components/   # views
├── hooks/ stores/       # reusable hooks and zustand state
├── lib/                 # utilities
├── data/                # inactive fixtures for reversibly hidden pages only
├── router.tsx main.tsx  # entry
└── test/
```

See `src/AGENTS.md` before changing frontend application code.

## Guards
- Components never call the backend directly — go through `src/services/*` (the API seam).
- Backend endpoint calls live under `src/services/api/*`; service files consume endpoint functions instead of scattering `fetch()` or backend JSON casts.
- `src/types/index.ts` mirrors the PRD/API contract for frontend code.
- Dev/prod/test runtime uses the real backend API seam. Do not reintroduce
  frontend mock auth users, localStorage auth sessions, or runtime demo branches.
- Login in dev/prod is backend-owned for both email/password and Kakao OAuth.
  Both paths must mint the same httpOnly backend JWT cookie and restore via
  `/api/v1/auth/me`. Do not reintroduce frontend mock auth users or localStorage
  auth sessions.
- `src/data/mockData.ts`, `src/services/db.ts`, and services that import them are
  inactive fixtures kept only for reversibly hidden pages. Do not route live
  runtime code through them; reactivation requires real backend wiring or deletion
  with the hidden pages.
- `strictPort` 3000 (ADR); pnpm only, never an npm lockfile.

## Run
- test: `pnpm --filter front test`.
- lint: `pnpm --filter front lint` (check) / `pnpm --filter front lint:fix` (autofix). Convention: ADR.
