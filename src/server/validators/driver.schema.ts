// src/server/validators/driver.schema.ts
/**
 * Driver Validation Schemas (Server-Side, Authoritative)
 * =============================================================================
 * What this file does
 * -------------------
 * Defines server-side validation schemas for driver-related inputs that feed
 * screening, matching, and insights services.
 *
 * These schemas:
 * - enforce data shape and basic constraints
 * - prevent malformed or unexpected input from reaching business logic
 * - act as a first-line safeguard against injection-style and logic abuse
 *
 * Why validation lives here
 * -------------------------
 * - Client-side validation is for UX only.
 * - Server-side validation is authoritative and non-negotiable.
 * - Centralising schemas avoids duplicated checks across routes/services.
 *
 * POPIA (South Africa) considerations
 * ----------------------------------
 * - Data minimisation: schemas validate only required operational fields.
 * - Purpose specification: validated data is used strictly for screening/matching.
 * - Safeguards: early rejection of invalid input reduces risk of misuse.
 */

import { z } from "zod";

/**
 * Common enums used across driver-related inputs.
 *
 * Keeping enums explicit:
 * - prevents unexpected string values
 * - improves auditability
 * - simplifies downstream branching logic
 */
export const DocumentsStatusSchema = z.enum([
  "verified",
  "pending",
  "missing",
  "rejected",
]);

export const TrainingStatusSchema = z.enum([
  "complete",
  "incomplete",
  "missing",
]);

export const AvailabilitySchema = z.enum([
  "day",
  "evening",
  "night",
  "weekend",
  "any",
]);

/**
 * Validation schema for driver screening input.
 *
 * Notes:
 * - This schema mirrors (but does not replace) the service-level input type.
 * - Validation focuses on shape and basic bounds, not business decisions.
 */
export const DriverScreeningInputSchema = z.object({
  driverId: z.string().min(1),

  // Profile completeness signals
  hasProfileBasics: z.boolean().optional(),
  hasLocation: z.boolean().optional(),
  hasAvailability: z.boolean().optional(),

  // Compliance/document signals
  documentsStatus: DocumentsStatusSchema.optional(),

  // Training signals
  trainingStatus: TrainingStatusSchema.optional(),

  // Performance signals
  yearsExperience: z
    .number()
    .int()
    .min(0)
    .max(60)
    .optional(),

  ratingAverage: z
    .number()
    .min(0)
    .max(5)
    .optional(),

  // Disqualifier/risk signals
  disqualifiers: z
    .object({
      policyDisqualifier: z.boolean().optional(),
      fraudSignal: z.boolean().optional(),
      safetyConcern: z.boolean().optional(),
    })
    .optional(),
});

/**
 * Inferred TypeScript type from the schema.
 *
 * Why this matters:
 * - Ensures runtime validation and compile-time typing stay in sync.
 * - Prevents drift between service expectations and route inputs.
 */
export type DriverScreeningInputValidated = z.infer<
  typeof DriverScreeningInputSchema
>;

/**
 * Helper: validates and returns typed driver screening input.
 *
 * Usage pattern (in API routes/controllers):
 * ------------------------------------------------
 * const input = validateDriverScreeningInput(req.body);
 * const result = await evaluateDriverScreening({ input });
 *
 * Error handling strategy:
 * - Validation errors should be converted into 400 responses.
 * - Error messages should be generic (avoid echoing raw input).
 */
export function validateDriverScreeningInput(
  payload: unknown
): DriverScreeningInputValidated {
  return DriverScreeningInputSchema.parse(payload);
}
