import { NextRequest, NextResponse } from "next/server";

const protectedPrefixes = [
  "/dashboard",
  "/alerts",
  "/admin",
  "/monitoring",
  "/reports",
  "/settings",
];

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const hasSessionCookie = Boolean(request.cookies.get("app_session")?.value);
  const protectedRoute = protectedPrefixes.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );

  // Demo mode (server predicate; duplicated from src/lib/config.ts because the
  // proxy must not pull client-only bundles): pass protected routes without the
  // cookie gate so a backend-free demo never bounces to /login.
  const demo = process.env.DEMO === "1" || process.env.NEXT_PUBLIC_DEMO === "1";

  // Optimistic UX-only gate: the backend remains authoritative. Dashboard server
  // rendering calls /auth/session before showing org-scoped content, so forged/stale
  // cookies cannot expose data even when this quick cookie-name check passes.
  if (!demo && protectedRoute && !hasSessionCookie) {
    return NextResponse.redirect(new URL("/login", request.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|auth|orgs|sse|_next/static|_next/image|favicon.ico).*)"],
};
