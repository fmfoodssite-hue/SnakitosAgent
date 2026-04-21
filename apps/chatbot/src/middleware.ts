import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Secure the Admin Path (/admin and sub-paths)
  if (pathname.startsWith('/admin')) {
    const authCookie = request.cookies.get('admin_auth');
    
    // In production, implement a stronger check here
    if (!authCookie) {
      return new NextResponse('Unauthorized: Team Access Only', { 
        status: 401,
        headers: { 'Content-Type': 'text/plain' }
      });
    }
  }

  // 2. Allow Public Chatbot Access (Shopify Proxy)
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
