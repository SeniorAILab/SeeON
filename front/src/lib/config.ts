// Canonical backend origin for all server-side fetches and the Next rewrites.
// Single source so the default can't desync across call sites (the bug #209 fixed).
// next.config.ts keeps its own copy — Next config cannot import from src/.
export const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN ?? "http://localhost:8080";
