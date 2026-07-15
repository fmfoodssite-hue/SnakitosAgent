import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const accessTokenCookie = "snakitos_admin_access_token";

function isLoginPath(pathname: string) {
  return pathname === "/login" || pathname.endsWith("/login");
}

function isAuthApiPath(pathname: string) {
  return pathname.startsWith("/api/auth") || pathname.includes("/api/auth");
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function base64UrlDecode(value: string) {
  return new TextDecoder().decode(base64UrlToBytes(value));
}

async function isValidAccessToken(token: string | undefined) {
  if (!token || !process.env.ADMIN_SESSION_SECRET) {
    return false;
  }

  const [encodedHeader, encodedPayload, signature] = token.split(".");
  if (!encodedHeader || !encodedPayload || !signature) {
    return false;
  }

  try {
    const header = JSON.parse(base64UrlDecode(encodedHeader)) as { alg?: string; typ?: string };
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as { exp?: number };
    if (header.alg !== "HS256" || header.typ !== "JWT") {
      return false;
    }
    if (typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now()) {
      return false;
    }

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(process.env.ADMIN_SESSION_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );

    return crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlToBytes(signature),
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
    );
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    isLoginPath(pathname) ||
    isAuthApiPath(pathname) ||
    pathname.startsWith("/_next") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get(accessTokenCookie)?.value;
  const hasValidAccessToken = await isValidAccessToken(accessToken);

  if (!hasValidAccessToken) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
