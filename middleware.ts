import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Middleware for Protected Routes
 * =============================================================================
 * This middleware works alongside client-side ProtectedRoute components.
 *
 * Since Firebase auth is client-side, the middleware uses a cookie-based
 * approach to avoid blocking authenticated users during SSR.
 *
 * Key behaviors:
 * - Public routes (/login, /complete-signup) are always accessible
 * - Protected routes redirect to /login if no session cookie exists
 * - The __session cookie is set automatically after successful Firebase login
 */

const PUBLIC = ["/login", "/complete-signup", "/favicon.ico", "/api"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public pages
  if (PUBLIC.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Check for session cookie (set after Firebase login)
  const session = req.cookies.get("__session")?.value;

  if (!session) {
    // No session - redirect to login
    // The client-side ProtectedRoute will handle the actual redirect
    // This is a fallback for direct navigation
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/business/:path*",
    "/driver/:path*",
    "/jobs/:path*",
  ],
};
