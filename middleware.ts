import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC = [
  "/login",
  "/complete-signup",
  "/favicon.ico",
  "/api/auth",
  "/_next",
  "/static",
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public pages and API auth routes
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();

  // Check Firebase session cookie (primary auth method)
  const firebaseSession = req.cookies.get("__session")?.value;

  // Also check NextAuth session cookie as fallback (handles both auth strategies)
  const nextAuthSession =
    req.cookies.get("next-auth.session-token")?.value ||
    req.cookies.get("__Secure-next-auth.session-token")?.value;

  if (!firebaseSession && !nextAuthSession) {
    // Preserve the original destination so user lands there after login
    // FIX 2: use ?redirect= to match searchParams.get("redirect") in login/page.tsx
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
