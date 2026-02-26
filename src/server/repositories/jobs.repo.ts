// src/server/repositories/jobs.repo.ts
/**
 * Jobs Repository (Firestore Access Wrapper)
 * =============================================================================
 * What this file does
 * -------------------
 * Provides narrowly-scoped functions for reading job data from Firestore and
 * mapping it into the minimal service input shapes required for:
 * - job-to-driver matching
 * - business insights aggregation (later)
 *
 * Design goals:
 * - least privilege (fetch only fields required for matching)
 * - consistent mapping (Firestore -> service inputs)
 * - avoid PII and free-text payloads in downstream logic
 *
 * POPIA (South Africa) considerations
 * ----------------------------------
 * - Data minimisation: only operational job signals are retrieved.
 * - Safeguards: repository avoids returning personal identifiers.
 *
 * IMPORTANT NOTE
 * --------------
 * Authorization is not performed inside the repository.
 * Callers must enforce authorization before calling repository functions.
 */

import type { JobMatchingInput } from "../services/matching.service";

/**
 * Placeholder Firestore types (replace with the project's actual Firestore types).
 * See drivers.repo.ts for details on why dependency injection is used.
 */
type FirestoreDoc = {
  exists: boolean;
  id: string;
  data(): Record<string, unknown> | undefined;
};

type FirestoreCollection = {
  doc(id: string): { get(): Promise<FirestoreDoc> };
};

type FirestoreDb = {
  collection(name: string): FirestoreCollection;
};

export interface JobsRepoDeps {
  db: FirestoreDb;
}

/**
 * Firestore collection naming.
 * Adjust to match the project's actual collection names.
 */
const COLLECTIONS = {
  jobs: "jobs",
} as const;

/**
 * Maps a Firestore job document into a JobMatchingInput.
 *
 * Mapping rules:
 * - Prefer explicit boolean and enum fields over raw text.
 * - Coordinates are mapped only if numeric lat/lng exist.
 * - Defaults remain undefined when unknown (to avoid false assumptions).
 */
function mapJobDocToMatchingInput(jobId: string, data: Record<string, unknown>): JobMatchingInput {
  const requiresTraining = typeof data["requiresTraining"] === "boolean" ? (data["requiresTraining"] as boolean) : undefined;

  const requiresVerifiedDocuments =
    typeof data["requiresVerifiedDocuments"] === "boolean"
      ? (data["requiresVerifiedDocuments"] as boolean)
      : undefined;

  // Location mapping (optional)
  const loc = data["jobLocation"] ?? data["location"];
  const jobLocation =
    loc && typeof loc === "object" && typeof (loc as any).lat === "number" && typeof (loc as any).lng === "number"
      ? { lat: (loc as any).lat, lng: (loc as any).lng }
      : undefined;

  // Distance (optional; kept conservative)
  const maxDistanceKm =
    typeof data["maxDistanceKm"] === "number"
      ? Math.max(1, Math.min(1000, Math.floor(data["maxDistanceKm"])))
      : undefined;

  // Time window (optional enum)
  const requiredTimeWindowRaw = data["requiredTimeWindow"];
  const requiredTimeWindow =
    requiredTimeWindowRaw === "day" ||
    requiredTimeWindowRaw === "evening" ||
    requiredTimeWindowRaw === "night" ||
    requiredTimeWindowRaw === "weekend" ||
    requiredTimeWindowRaw === "any"
      ? requiredTimeWindowRaw
      : undefined;

  // Preferences (optional booleans)
  const preferHighRating = typeof data["preferHighRating"] === "boolean" ? (data["preferHighRating"] as boolean) : undefined;
  const preferExperience = typeof data["preferExperience"] === "boolean" ? (data["preferExperience"] as boolean) : undefined;

  return {
    jobId,
    requiresTraining,
    requiresVerifiedDocuments,
    jobLocation,
    maxDistanceKm,
    requiredTimeWindow,
    preferHighRating,
    preferExperience,
  };
}

/**
 * Reads a job by ID and returns the minimal matching input model.
 *
 * Return values:
 * - null when job does not exist
 * - JobMatchingInput when found
 *
 * Security note:
 * - Authorization must be enforced by the caller.
 */
export async function getJobForMatching(deps: JobsRepoDeps, jobId: string): Promise<JobMatchingInput | null> {
  const doc = await deps.db.collection(COLLECTIONS.jobs).doc(jobId).get();
  if (!doc.exists) return null;

  const data = doc.data();
  if (!data) return null;

  return mapJobDocToMatchingInput(jobId, data);
}
