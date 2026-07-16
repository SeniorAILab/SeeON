# Frontend service boundary

- `apiClient` is the only fetch/credentials/401 seam. Endpoint paths are relative to `/api/v1`; components must not construct deployment URLs.
- Parse external responses from `unknown` and reject malformed lifecycle states before mapping them into UI types.
- Service wrappers accept `AbortSignal` where navigation can stale a request. Never let an older response replace a newer event/media state.
- Alert confirmation is `PATCH /alerts/:id/resolve`; memo creation is `POST /alerts/:id/notes` and does not resolve the alert.
- Native video content is `/alerts/:alertId/media/content`; preserve authenticated Range delivery and do not expose storage keys.

