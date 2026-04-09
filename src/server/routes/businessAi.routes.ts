// src/server/routes/businessAi.routes.ts
/**
 * Business AI Routes (Server-Side Wiring Layer)
 * =============================================================================
 * What this file does
 * -------------------
 * Provides route handler functions that wire together the overlay layers:
 * - policies (auth + role)
 * - validators (Zod schemas)
 * - services (screening/matching/insights)
 * - security utilities (rate limit + audit logging)
 * - repositories (Firestore reads)
 *
 * This file is framework-agnostic by design:
 * - Next.js API routes (app router or pages router) can call these handlers
 * - Other server runtimes can adapt these handlers as needed
 *
 * POPIA (South Africa) considerations
 * ----------------------------------
 * - Data minimisation: handlers accept only required inputs and return only
 *   operational outputs.
 * - Safeguards: role checks + rate limiting + audit logs protect processing.
 * - Purpose limitation: endpoints are limited to business operations.
 *
 * IMPORTANT NOTE
 * --------------
 * This file does not register HTTP routes directly. It exports handlers that
 * can be called by actual API route files in the existing `main` structure.
 */

import { requireAuth, requireRole, policyErrorToResponse, type AuthUser } from "../policies/auth";
import { validateDriverScreeningInput } from "../validators/driver.schema";
import { validateJobMatchingRequest } from "../validators/job.schema";
import { assertRateLimit } from "../security/rateLimit";
import { buildAuditEvent, writeAuditEvent } from "../security/audit";
import { redactError } from "../security/redact";
import { evaluateDriverScreening } from "../services/screening.service";
import { matchDriversToJob } from "../services/matching.service";
import { generateBusinessInsight } from "../services/insights.service";
import type { DriversRepoDeps } from "../repositories/drivers.repo";
import type { JobsRepoDeps } from "../repositories/jobs.repo";
import { getDriverForScreening, getDriversForMatching } from "../repositories/drivers.repo";
import { getJobForMatching } from "../repositories/jobs.repo";
import { consumeCredit } from "@/lib/credits.server";

/**
 * Route dependencies required by handlers.
 *
 * Why dependency injection is used:
 * - Enables testing without Firestore.
 * - Avoids hard-binding handlers to a specific runtime initializer.
 */
export interface BusinessAiRouteDeps {
  driversRepo: DriversRepoDeps;
  jobsRepo: JobsRepoDeps;
}

/**
 * Standard response shape returned by handlers.
 * Framework-specific adapters can convert this to NextResponse/res.json/etc.
 */
export type RouteResponse =
  | { status: number; body: any; headers?: Record<string, string> }
  | { status: number; body: any };

/**
 * Helper: builds a conservative rate limit key.
 *
 * Key guidance:
 * - Prefer internal uid/businessId.
 * - Avoid email/phone/name.
 * - Do not store raw IP address here unless hashed upstream.
 */
function rateKey(prefix: string, user: AuthUser): string {
  return `${prefix}:${user.uid}:${user.role}:${user.businessId ?? "no_business"}`;
}

/**
 * Handler: Driver Screening (business-side)
 *
 * Expected use:
 * - A business reviews a driver application by ID.
 *
 * Flow:
 * 1) Auth + role enforcement (business/admin)
 * 2) Rate limit protection
 * 3) Payload validation (Zod)
 * 4) Repository read (minimal driver signals)
 * 5) Service evaluation (deterministic rules)
 * 6) Audit log write (PII-safe)
 */
export async function handleDriverScreening(params: {
  deps: BusinessAiRouteDeps;
  user: AuthUser | null | undefined;
  body: unknown;
  traceId?: string;
}): Promise<RouteResponse> {
  try {
    const authed = requireAuth(params.user);
    requireRole(authed, ["business", "admin"]);

    // Check and consume credit before processing
    const creditResult = await consumeCredit(authed.uid);
    if (!creditResult.success) {
      if (creditResult.reason === "NO_CREDITS") {
        return { status: 402, body: { error: "NO_CREDITS" } };
      }
      if (creditResult.reason === "USER_NOT_FOUND") {
        return { status: 404, body: { error: "USER_NOT_FOUND" } };
      }
      return { status: 500, body: { error: "CREDIT_CHECK_FAILED" } };
    }

    // Rate limit: protects abuse and prevents runaway evaluation costs.
    assertRateLimit(rateKey("screening", authed), { limit: 30, windowMs: 60_000 });

    // Validate request payload shape first (reject malformed input early).
    const validated = validateDriverScreeningInput(params.body);

    // Load minimal driver signals from Firestore (least privilege).
    const driver = await getDriverForScreening(params.deps.driversRepo, validated.driverId);
    if (!driver) {
      return { status: 404, body: { error: "DRIVER_NOT_FOUND" } };
    }

    // Evaluate deterministically using rules.
    const output = await evaluateDriverScreening({
      input: driver,
      traceId: params.traceId,
    });

    // Audit the outcome using internal IDs only (no PII).
    const event = buildAuditEvent({
      type: "DRIVER_SCREENING_EVALUATED",
      output,
      traceId: params.traceId,
      driverId: validated.driverId,
      businessId: authed.businessId ?? undefined,
    });
    writeAuditEvent(event);

    return { status: 200, body: output };
  } catch (err) {
    // Convert known policy errors into safe responses.
    const policy = policyErrorToResponse(err);
    if (policy.status !== 500) return policy;

    // Unknown errors: return a generic error.
    // Error details should be logged server-side with redaction.
    console.error("handleDriverScreening:error", redactError(err));
    return { status: 500, body: { error: "INTERNAL_ERROR" } };
  }
}

/**
 * Handler: Job-to-Driver Matching (business-side)
 *
 * Expected use:
 * - A business wants recommended drivers for a job.
 *
 * Flow:
 * 1) Auth + role enforcement (business/admin)
 * 2) Rate limit protection
 * 3) Payload validation (job + driver IDs or driver list)
 * 4) Repository reads (job + minimal driver signals)
 * 5) Service evaluation (deterministic ranking)
 * 6) Audit log write (PII-safe)
 *
 * Input design note:
 * - The schema currently supports passing driver candidate objects directly.
 * - In production, this handler can also accept driverIds and load candidates
 *   from Firestore for least privilege and consistency.
 */
export async function handleJobMatching(params: {
  deps: BusinessAiRouteDeps;
  user: AuthUser | null | undefined;
  body: unknown;
  traceId?: string;
}): Promise<RouteResponse> {
  try {
    const authed = requireAuth(params.user);
    requireRole(authed, ["business", "admin"]);

    // Check and consume credit before processing
    const creditResult = await consumeCredit(authed.uid);
    if (!creditResult.success) {
      if (creditResult.reason === "NO_CREDITS") {
        return { status: 402, body: { error: "NO_CREDITS" } };
      }
      if (creditResult.reason === "USER_NOT_FOUND") {
        return { status: 404, body: { error: "USER_NOT_FOUND" } };
      }
      return { status: 500, body: { error: "CREDIT_CHECK_FAILED" } };
    }

    assertRateLimit(rateKey("matching", authed), { limit: 60, windowMs: 60_000 });

    const validated = validateJobMatchingRequest(params.body);

    // Job is loaded from Firestore to avoid trusting client-provided job constraints.
    const job = await getJobForMatching(params.deps.jobsRepo, validated.job.jobId);
    if (!job) {
      return { status: 404, body: { error: "JOB_NOT_FOUND" } };
    }

    // Candidate drivers can be passed in directly or loaded by ID.
    // For least privilege, prefer loading from Firestore when IDs are available.
    const driverIds = validated.drivers.map((d) => d.driverId);
    const drivers = await getDriversForMatching(params.deps.driversRepo, driverIds);

    const output = await matchDriversToJob({
      job,
      drivers,
      limit: validated.limit,
      traceId: params.traceId,
    });

    const event = buildAuditEvent({
      type: "JOB_MATCHING_EVALUATED",
      output,
      traceId: params.traceId,
      jobId: validated.job.jobId,
      businessId: authed.businessId ?? undefined,
    });
    writeAuditEvent(event);

    return { status: 200, body: output };
  } catch (err) {
    const policy = policyErrorToResponse(err);
    if (policy.status !== 500) return policy;

    console.error("handleJobMatching:error", redactError(err));
    return { status: 500, body: { error: "INTERNAL_ERROR" } };
  }
}

/**
 * Handler: Business Insights (business-side)
 *
 * Expected use:
 * - A business asks a known-category operational question.
 *
 * Flow:
 * 1) Auth + role enforcement (business/admin)
 * 2) Rate limit protection
 * 3) Validation (basic shape; deeper validation happens in the service)
 * 4) Service response (template-driven answer + metrics)
 * 5) Audit log write
 *
 * Data note:
 * - V1 expects aggregated metrics in the payload.
 * - Later, metrics can be computed server-side from Firestore.
 */
export async function handleBusinessInsight(params: {
  deps: BusinessAiRouteDeps;
  user: AuthUser | null | undefined;
  body: unknown;
  traceId?: string;
}): Promise<RouteResponse> {
  try {
    const authed = requireAuth(params.user);
    requireRole(authed, ["business", "admin"]);

    assertRateLimit(rateKey("insights", authed), { limit: 30, windowMs: 60_000 });

    // V1 insight input is intentionally flexible; the service is robust to missing metrics.
    // A Zod schema can be added later if the input structure stabilises.
    const output = await generateBusinessInsight({
      input: params.body as any,
      traceId: params.traceId,
    });

    const event = buildAuditEvent({
      type: "BUSINESS_INSIGHT_GENERATED",
      output,
      traceId: params.traceId,
      businessId: authed.businessId ?? undefined,
    });
    writeAuditEvent(event);

    return { status: 200, body: output };
  } catch (err) {
    const policy = policyErrorToResponse(err);
    if (policy.status !== 500) return policy;

    console.error("handleBusinessInsight:error", redactError(err));
    return { status: 500, body: { error: "INTERNAL_ERROR" } };
  }
}
