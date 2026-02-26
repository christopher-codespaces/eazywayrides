// src/server/security/audit.ts
/**
 * Audit Logging Utility (Server-Side)
 * =============================================================================
 * What this file does
 * -------------------
 * Provides a small, consistent audit logging utility for sensitive operations
 * such as:
 * - driver screening evaluations
 * - job-to-driver matching
 * - business insights generation
 *
 * The logger:
 * - records *what* happened and *why* (policy/version/reason codes)
 * - avoids storing personal information
 * - produces structured logs suitable for later review or export
 *
 * Why this exists
 * ---------------
 * Audit logs are essential for:
 * - debugging complex decision flows
 * - explaining outcomes to stakeholders
 * - demonstrating compliance and accountability
 *
 * POPIA (South Africa) considerations
 * ----------------------------------
 * - Data minimisation: logs must not contain personal identifiers.
 * - Safeguards: logs should be structured and access-controlled.
 * - Purpose limitation: logs are used for operational oversight and debugging,
 *   not profiling or unrelated analytics.
 *
 * IMPORTANT RULE
 * --------------
 * This logger must never receive or store:
 * - names
 * - phone numbers
 * - email addresses
 * - raw documents or attachments
 */

import type {
  AIContractOutput,
  ReasonCode,
  RiskFlag,
} from "../ai/contract";

/**
 * Allowed audit event types.
 *
 * Keeping event types explicit:
 * - prevents free-form logging
 * - simplifies filtering and analysis
 */
export type AuditEventType =
  | "DRIVER_SCREENING_EVALUATED"
  | "JOB_MATCHING_EVALUATED"
  | "BUSINESS_INSIGHT_GENERATED";

/**
 * Base audit event shape.
 *
 * Design notes:
 * - Uses internal IDs only (driverId, jobId, businessId).
 * - Avoids user-facing or sensitive identifiers.
 */
export interface AuditEvent {
  /** Event category/type. */
  type: AuditEventType;

  /** When the event occurred (UTC ISO). */
  occurredAt: string;

  /** Optional correlation identifier for request tracing. */
  traceId?: string;

  /** Feature identifier (screening, matching, insights). */
  feature: AIContractOutput["feature"];

  /** Policy version that produced the output. */
  policyVersion: string;

  /** Reason codes that justify the outcome. */
  reasonCodes: ReasonCode[];

  /** Optional risk flags raised during evaluation. */
  riskFlags?: RiskFlag[];

  /**
   * Optional entity references (internal IDs only).
   * These fields should be populated selectively based on the feature.
   */
  driverId?: string;
  jobId?: string;
  businessId?: string;
}

/**
 * Builds a base audit event from a contract output.
 *
 * Why this helper exists:
 * - Ensures consistent mapping between service outputs and audit logs.
 * - Prevents accidental logging of sensitive fields.
 */
export function buildAuditEvent(params: {
  type: AuditEventType;
  output: AIContractOutput;
  traceId?: string;
  driverId?: string;
  jobId?: string;
  businessId?: string;
}): AuditEvent {
  return {
    type: params.type,
    occurredAt: new Date().toISOString(),
    traceId: params.traceId,
    feature: params.output.feature,
    policyVersion: params.output.meta.policyVersion,
    reasonCodes: params.output.reasonCodes,
    riskFlags: params.output.riskFlags,
    driverId: params.driverId,
    jobId: params.jobId,
    businessId: params.businessId,
  };
}

/**
 * Writes an audit event.
 *
 * Current behavior (V1):
 * - Logs to stdout using structured JSON.
 *
 * Extension points:
 * - Forward to a secure log sink
 * - Write to Firestore (restricted collection)
 * - Stream to a SIEM or monitoring system
 *
 * Safety constraints:
 * - Caller must ensure no PII is included in the event.
 * - Access to stored audit logs should be restricted to authorised roles.
 */
export function writeAuditEvent(event: AuditEvent): void {
  // Structured logging ensures logs remain machine-readable.
  // In production, this can be replaced or augmented with a secure sink.
  console.log(
    JSON.stringify({
      level: "audit",
      ...event,
    })
  );
}
