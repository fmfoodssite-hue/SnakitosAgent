import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const adminBasePath = "/admin";
const sessionCookie = "snakitos_admin_session";

function isLoginPath(pathname: string) {
  return pathname === "/login" || pathname === `${adminBasePath}/login`;
}

function isAuthApiPath(pathname: string) {
  return pathname.startsWith("/api/auth") || pathname.startsWith(`${adminBasePath}/api/auth`);
}

// Next.js 16 uses proxy.ts (renamed from middleware.ts)
// The export must be named "proxy" in this file
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow the login page and all API auth routes through without checking session
  if (
    isLoginPath(pathname) ||
    isAuthApiPath(pathname) ||
    pathname.startsWith("/_next") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const adminSession = request.cookies.get(sessionCookie);

  if (!adminSession) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = isLoginPath(pathname) ? pathname : `${adminBasePath}/login`;
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
