import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/admin")) {
    const authCookie = request.cookies.get("admin_auth");

    if (!authCookie) {
      return new NextResponse("Unauthorized: Team Access Only", {
        status: 401,
        headers: { "Content-Type": "text/plain" },
      });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
