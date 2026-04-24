import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Next.js 16 uses proxy.ts (renamed from middleware.ts)
// The export must be named "proxy" in this file
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow the login page and all API auth routes through without checking session
  if (
    pathname === "/login" ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const adminSession = request.cookies.get("admin_session");

  if (!adminSession) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
