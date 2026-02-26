// src/app/api/business/ai/screening/route.ts
/**
 * Next.js App Router API Route — Driver Screening (Business)
 * =============================================================================
 * What this file does
 * -------------------
 * Exposes a concrete HTTP endpoint for business-side driver screening by wiring:
 * - server auth claims extraction (Firebase Admin token verification)
 * - minimal user context building (uid/role/businessId)
 * - Firestore repository dependencies (Admin Firestore)
 * - framework-agnostic handler invocation
 * - NextResponse creation via adapter
 *
 * Why this route stays minimal
 * ----------------------------
 * This file is responsible only for HTTP concerns:
 * 1) parse request JSON safely
 * 2) resolve auth context
 * 3) inject dependencies
 * 4) call handler and return response
 *
 * Business logic remains in `src/server/*`.
 *
 * POPIA (South Africa) considerations
 * ----------------------------------
 * - Data minimisation: only required request payload is accepted.
 * - Safeguards: authentication/authorization and rate limiting are enforced
 *   in the handler layer.
 * - Logging: no raw request payload should be logged from this route.
 */

import { toNextResponse } from "@/server/routes/nextAdapters";
import { handleDriverScreening } from "@/server/routes/businessAi.routes";
import { buildAuthUserFromClaims } from "@/server/policies/userContext";
import { getAuthClaimsFromRequest } from "@/server/policies/firebaseAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";

/**
 * POST /api/business/ai/screening
 *
 * Expected request body (minimal):
 * - { "driverId": "<driver_document_id>" }
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
    driversRepo: { db: getAdminDb() },
    jobsRepo: { db: getAdminDb() },
  };

  // Delegate all policy checks, validation, and auditing to the handler layer.
  const response = await handleDriverScreening({
    deps,
    user,
    body,
    traceId,
  });

  return toNextResponse(response);
}
