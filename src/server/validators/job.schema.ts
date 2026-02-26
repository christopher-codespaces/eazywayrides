// src/server/validators/job.schema.ts
/**
 * Job Validation Schemas (Server-Side, Authoritative)
 * =============================================================================
 * What this file does
 * -------------------
 * Defines server-side validation schemas for job-related inputs that feed the
 * job-to-driver matching service.
 *
 * These schemas:
 * - enforce expected shapes and basic constraints
 * - prevent malformed payloads from reaching business logic
 * - provide typed outputs via Zod inference
 *
 * Why validation lives here
 * -------------------------
 * - Client-side validation is for UX only.
 * - Server-side validation is authoritative and required for security.
 * - Central schemas reduce duplication across routes/services.
 *
 * POPIA (South Africa) considerations
 * ----------------------------------
 * - Data minimisation: schemas validate only operational fields required
 *   for matching (constraints and signals).
 * - Safeguards: schemas reduce the risk of unexpected input affecting logic.
 */

import { z } from "zod";
import { AvailabilitySchema, DocumentsStatusSchema, TrainingStatusSchema } from "./driver.schema";

/**
 * Geographic coordinate schema used for distance-based matching.
 *
 * Constraints:
 * - Latitude:  -90..90
 * - Longitude: -180..180
 *
 * Rationale:
 * - Prevents invalid coordinates from creating distorted distances or errors.
 */
export const GeoPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/**
 * Validation schema for job matching request input.
 *
 * This schema matches the service-level JobMatchingInput but focuses on:
 * - shape
 * - enum safety
 * - sensible bounds
 */
export const JobMatchingInputSchema = z.object({
  jobId: z.string().min(1),

  // Hard constraints / requirements
  requiresTraining: z.boolean().optional(),
  requiresVerifiedDocuments: z.boolean().optional(),

  // Distance constraints
  jobLocation: GeoPointSchema.optional(),
  maxDistanceKm: z.number().int().min(1).max(1000).optional(),

  // Time window constraint
  requiredTimeWindow: AvailabilitySchema.optional(),

  // Preferences (soft constraints)
  preferHighRating: z.boolean().optional(),
  preferExperience: z.boolean().optional(),
});

/**
 * Validation schema for a single driver candidate used in matching.
 *
 * Notes:
 * - Uses internal driverId and operational signals.
 * - Avoids PII fields by design.
 */
export const DriverCandidateInputSchema = z.object({
  driverId: z.string().min(1),

  // Eligibility signals
  documentsStatus: DocumentsStatusSchema.optional(),
  trainingStatus: TrainingStatusSchema.optional(),

  // Operational signals
  driverLocation: GeoPointSchema.optional(),
  availability: AvailabilitySchema.optional(),

  // Performance signals
  yearsExperience: z.number().int().min(0).max(60).optional(),
  ratingAverage: z.number().min(0).max(5).optional(),

  // Risk signals
  risk: z
    .object({
      fraudSignal: z.boolean().optional(),
      safetyConcern: z.boolean().optional(),
    })
    .optional(),
});

/**
 * Validation schema for a full matching request.
 *
 * Typical usage:
 * - job: job constraints/signals
 * - drivers: list of candidates
 * - limit: optional candidate limit (default in service)
 */
export const JobMatchingRequestSchema = z.object({
  job: JobMatchingInputSchema,
  drivers: z.array(DriverCandidateInputSchema).max(500),
  limit: z.number().int().min(1).max(50).optional(),
});

/**
 * Inferred types for validated payloads.
 */
export type JobMatchingInputValidated = z.infer<typeof JobMatchingInputSchema>;
export type DriverCandidateInputValidated = z.infer<typeof DriverCandidateInputSchema>;
export type JobMatchingRequestValidated = z.infer<typeof JobMatchingRequestSchema>;

/**
 * Helper: validates and returns a typed matching request.
 *
 * Error handling strategy:
 * - Convert validation errors into 400 responses.
 * - Avoid echoing raw payloads in error messages/logs.
 */
export function validateJobMatchingRequest(payload: unknown): JobMatchingRequestValidated {
  return JobMatchingRequestSchema.parse(payload);
}
