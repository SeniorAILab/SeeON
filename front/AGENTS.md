# Frontend agent rules — Vite 5 + React 18 + TypeScript strict dashboard (run/boot/flow in root AGENTS.md)

## Layout

```
front/src/
├── services/
│   ├── api/             # endpoint mappers: backend DTO validation + domain mapping
│   └── *.ts             # service workflows
├── types/               # index.ts = frontend domain SSOT (until Phase 2)
├── pages/ components/   # views
├── hooks/ store/ stores/ # state
├── lib/                 # utilities
├── mocks/ data/         # mock runtime (only when VITE_USE_MOCK=true)
├── router.tsx main.tsx  # entry
└── test/
```

## Guards
- Components never call the backend directly — go through `src/services/*` (the API seam).
- Backend endpoint calls live under `src/services/api/*`; service files consume endpoint functions instead of scattering `fetch()` or backend JSON casts.
- `src/types/index.ts` is the frontend domain SSOT until Phase 2.
- Real backend mode is default (`VITE_USE_MOCK` unset or `false`). Mock mode
  requires explicit `VITE_USE_MOCK=true` and is for tests/demo-only surfaces.
- Login in dev/prod is backend-owned for both email/password and Kakao OAuth.
  Both paths must mint the same httpOnly backend session cookie and restore via
  `/auth/session`. Do not reintroduce frontend mock auth users or localStorage
  auth sessions.
- `strictPort` 3000 (ADR-041); pnpm only, never an npm lockfile.

## Run
- test: `pnpm --filter front test`.
