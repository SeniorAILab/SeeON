import { NextRequest, NextResponse } from "next/server";

const protectedPrefixes = ["/dashboard", "/alerts", "/admin"];

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const cookieHeader = request.headers.get("cookie") ?? "";
  const hasSessionCookie =
    Boolean(request.cookies.get("app_session")?.value) ||
    /(?:^|;\s*)app_session=/.test(cookieHeader);
  const protectedRoute = protectedPrefixes.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );

  // Optimistic UX-only gate: the backend remains authoritative. Dashboard server
  // rendering calls /auth/session before showing org-scoped content, so forged/stale
  // cookies cannot expose data even when this quick cookie-name check passes.
  if (protectedRoute && !hasSessionCookie) {
    return NextResponse.redirect(new URL("/login", request.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|auth|orgs|sse|_next/static|_next/image|favicon.ico).*)"],
};
