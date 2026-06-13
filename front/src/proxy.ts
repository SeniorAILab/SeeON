import { NextRequest, NextResponse } from "next/server";

const protectedPrefixes = ["/dashboard", "/alerts", "/admin"];
const publicAuthRoutes = ["/login"];

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const hasSession = Boolean(request.cookies.get("app_session")?.value);
  const protectedRoute = protectedPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

  if (protectedRoute && !hasSession) {
    return NextResponse.redirect(new URL("/login", request.nextUrl));
  }

  if (publicAuthRoutes.includes(path) && hasSession) {
    return NextResponse.redirect(new URL("/dashboard", request.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|auth|orgs|sse|_next/static|_next/image|favicon.ico).*)"],
};
