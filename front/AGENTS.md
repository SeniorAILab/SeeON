# Frontend agent rules

- `front/` is Vite 5 + React 18 + TypeScript strict.
- `src/services/*` is the API seam; components must not call the backend directly.
- `src/types/index.ts` is the frontend domain SSOT until Phase 2.
- Phase 1 defaults to mock runtime (`USE_MOCK=true`); real backend calls are forbidden.
- Dev and preview run on port 3000 with `strictPort` per ADR-041.
- Use pnpm only; do not create npm lockfiles.
