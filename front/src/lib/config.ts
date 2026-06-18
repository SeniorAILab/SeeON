// Canonical backend origin for all server-side fetches and the Next rewrites.
// Single source so the default can't desync across call sites (the bug #209 fixed).
// next.config.ts keeps its own copy — Next config cannot import from src/.
export const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN ?? "http://localhost:8080";

// Demo mode flags.
// IS_DEMO is the client-side flag: NEXT_PUBLIC_* is inlined into the browser
// bundle at build time, so client modules (api.ts, sse.ts) can only rely on it.
export const IS_DEMO = process.env.NEXT_PUBLIC_DEMO === "1";

// Server demo predicate for server components, the proxy, and route handlers.
// Reads a non-public DEMO var first so server/proxy/rewrite behavior cannot
// diverge from the client. The demo command sets BOTH: DEMO=1 NEXT_PUBLIC_DEMO=1.
// next.config.ts cannot import from src/, so it duplicates this exact predicate.
export function isServerDemo(): boolean {
  return process.env.DEMO === "1" || process.env.NEXT_PUBLIC_DEMO === "1";
}
