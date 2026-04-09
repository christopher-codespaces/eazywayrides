/**
 * Firebase Admin Authorization Middleware
 * =============================================================================
 * Verifies Firebase ID tokens and enforces admin role for protected routes.
 *
 * Security:
 * - Requires Bearer token in Authorization header
 * - Verifies token using Firebase Admin SDK
 * - Returns 401 for missing/invalid tokens
 * - Returns 403 for non-admin users
 */

import "server-only";

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAdminAuth } from "@/lib/firebaseAdmin";

export async function requireAdmin(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.slice("Bearer ".length).trim();
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await getAdminAuth().verifyIdToken(token);

    if (decoded.admin !== true) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return null; // Auth passed

  } catch (error) {
    console.error("Auth error:", error);
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
}
