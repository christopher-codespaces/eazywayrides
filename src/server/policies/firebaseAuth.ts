// src/server/policies/firebaseAuth.ts
/**
 * Firebase Auth (Server-Side) — Claims Extraction
 * =============================================================================
 * What this file does
 * -------------------
 * Extracts and verifies a Firebase ID token from the request and returns a
 * minimal claims object for authorization decisions.
 *
 * Behavior:
 * - Reads Authorization header: "Bearer <idToken>"
 * - Verifies token via Admin SDK
 * - Returns minimal claims (uid/role/businessId)
 *
 * POPIA (South Africa) considerations
 * ----------------------------------
 * - Data minimisation: returns only operational claims.
 * - Safeguards: verification happens server-side using Admin SDK.
 */

import "server-only";

import type { AuthClaimsLike } from "./userContext";
import { getAdminAuth } from "@/lib/firebaseAdmin";

export async function getAuthClaimsFromRequest(request: Request): Promise<AuthClaimsLike | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return null;

  const decoded = await getAdminAuth().verifyIdToken(token);

  // Only minimal fields are returned. Unknown fields are handled downstream.
  return {
    uid: decoded.uid,
    role: (decoded as any).role,
    businessId: (decoded as any).businessId,
  };
}
