// src/app/api/business/ai/matching/route.ts
/**
 * Next.js App Router API Route — Job Matching (Business)
 * =============================================================================
 * What this file does
 * -------------------
 * Exposes a concrete HTTP endpoint for job-to-driver matching by wiring:
 * - server auth claims extraction (Firebase Admin token verification)
 * - minimal user context building (uid/role/businessId)
 * - Firestore repository dependencies (Admin Firestore)
 * - framework-agnostic handler invocation
 * - NextResponse creation via adapter
 *
 * Responsibilities
 * ----------------
 * - parse request JSON safely
 * - resolve auth context (server-only)
 * - inject dependencies (Admin Firestore)
 * - invoke handler and return response
 *
 * POPIA (South Africa) considerations
 * ----------------------------------
 * - Data minimisation: request payload should contain only jobId and driver IDs
 *   (or minimal candidate signals) necessary for matching.
 * - Safeguards: authentication/authorization and rate limiting are enforced
 *   in the handler layer.
 * - Logging: avoid logging raw payloads or sensitive identifiers.
 */

import { toNextResponse } from "@/server/routes/nextAdapters";
import { handleJobMatching } from "@/server/routes/businessAi.routes";
import { buildAuthUserFromClaims } from "@/server/policies/userContext";
import { getAuthClaimsFromRequest } from "@/server/policies/firebaseAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";

/**
 * POST /api/business/ai/matching
 *
 * Expected request body shape (V1):
 * {
 *   "job": { "jobId": "<job_document_id>" },
 *   "drivers": [{ "driverId": "<driver_document_id>" }, ...],
 *   "limit": 5
 * }
 */
export async function POST(request: Request) {
  const traceId = crypto.randomUUID();

  // Parse JSON body defensively; invalid JSON returns 400.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return toNextResponse({ status: 400, body: { error: "INVALID_JSON" } });
  }

  // Verify token and build minimal user context (least privilege by default).
  const claims = await getAuthClaimsFromRequest(request);
  const user = buildAuthUserFromClaims(claims);

  // Inject repository dependencies using privileged Admin Firestore.
  const deps = {
    driversRepo: { db: getAdminDb () },
    jobsRepo: { db: getAdminDb () },
  };

  // Delegate all policy checks, validation, and auditing to the handler layer.
  const response = await handleJobMatching({
    deps,
    user,
    body,
    traceId,
  });

  return toNextResponse(response);
}
