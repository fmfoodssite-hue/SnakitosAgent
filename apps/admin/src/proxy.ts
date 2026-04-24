import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const adminBasePath = "/apps/admin";

// Next.js 16 uses proxy.ts (renamed from middleware.ts)
// The export must be named "proxy" in this file
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const loginPath = `${adminBasePath}/login`;
  const authApiPath = `${adminBasePath}/api/auth`;

  // Allow the login page and all API auth routes through without checking session
  if (
    pathname === loginPath ||
    pathname.startsWith(authApiPath) ||
    pathname.startsWith("/_next") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const adminSession = request.cookies.get("admin_session");

  if (!adminSession) {
    const loginUrl = new URL(loginPath, request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
