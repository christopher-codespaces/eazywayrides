import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC = ["/login", "/complete-signup", "/favicon.ico"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // allow public pages
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();

  // check session cookie
  const session = req.cookies.get("__session")?.value;
  if (!session) return NextResponse.redirect(new URL("/login", req.url));

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
