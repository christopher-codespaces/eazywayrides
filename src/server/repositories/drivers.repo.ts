// src/server/repositories/drivers.repo.ts
/**
 * Drivers Repository (Firestore Access Wrapper)
 * =============================================================================
 * What this file does
 * -------------------
 * Provides narrowly-scoped functions for reading driver data from Firestore.
 *
 * Design goals:
 * - least privilege (only read the fields required by services)
 * - consistent data mapping (Firestore -> service inputs)
 * - reduced duplication (no ad-hoc queries scattered across routes/services)
 *
 * Why this exists
 * ---------------
 * Direct Firestore access from multiple layers typically leads to:
 * - inconsistent document shapes and null-handling
 * - security bugs caused by missing authorization checks
 * - accidental over-fetching of sensitive fields
 *
 * This repository keeps Firestore access small, predictable, and reviewable.
 *
 * POPIA (South Africa) considerations
 * ----------------------------------
 * - Data minimisation: only operational fields required for screening/matching
 *   should be fetched and returned.
 * - Safeguards: repositories should avoid returning PII by default.
 * - Purpose specification: data is used strictly for operational evaluation.
 *
 * IMPORTANT NOTE
 * --------------
 * This repository does not perform authorization checks itself.
 * Authorization must be enforced before repository calls, typically using
 * policy helpers in `src/server/policies/*`.
 *
 * Firestore SDK integration note
 * ------------------------------
 * Project structure may use:
 * - Firebase Admin SDK (server-side) OR
 * - Firebase client SDK (server-side via Next.js server runtime)
 *
 * This file assumes a server-side Firestore instance is available via an
 * existing project module. If the project already has a Firestore admin/client
 * initializer, replace the placeholder import below.
 */

import type { DriverScreeningInput } from "../services/screening.service";
import type { DriverCandidateInput } from "../services/matching.service";

/**
 * Placeholder Firestore types to avoid hard-binding this repository to a specific
 * initialization module. Replace these with the project's actual Firestore import.
 *
 * Examples (depending on project):
 * - import { adminDb } from "@/lib/firebaseAdmin";
 * - import { db } from "@/lib/firebase";
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

/**
 * Injected dependencies for Firestore access.
 *
 * Rationale:
 * - Keeps repository testable (mock db).
 * - Avoids importing environment-specific singletons in every file.
 */
export interface DriversRepoDeps {
  db: FirestoreDb;
}

/**
 * Firestore collection naming.
 * Adjust to match the project's actual collection names.
 */
const COLLECTIONS = {
  drivers: "drivers",
} as const;

/**
 * Maps Firestore driver document data into the minimal DriverScreeningInput.
 *
 * Mapping rules:
 * - Default missing values to undefined (not falsy) when unknown.
 * - Convert untrusted fields into safe signals.
 * - Avoid passing PII (names, phone, email) into screening input.
 */
function mapDriverDocToScreeningInput(driverId: string, data: Record<string, unknown>): DriverScreeningInput {
  // The mapping uses conservative boolean flags rather than raw text fields.
  // These flags can be computed from the project’s stored profile schema.
  const hasProfileBasics = Boolean(data["hasProfileBasics"] ?? data["profileComplete"]);
  const hasLocation = Boolean(data["hasLocation"] ?? data["location"]);
  const hasAvailability = Boolean(data["hasAvailability"] ?? data["availability"]);

  // Document and training status should come from controlled fields, not free text.
  const documentsStatusRaw = data["documentsStatus"];
  const trainingStatusRaw = data["trainingStatus"];

  const documentsStatus =
    documentsStatusRaw === "verified" ||
    documentsStatusRaw === "pending" ||
    documentsStatusRaw === "missing" ||
    documentsStatusRaw === "rejected"
      ? documentsStatusRaw
      : undefined;

  const trainingStatus =
    trainingStatusRaw === "complete" ||
    trainingStatusRaw === "incomplete" ||
    trainingStatusRaw === "missing"
      ? trainingStatusRaw
      : undefined;

  // Experience and rating may be stored differently; values are normalised cautiously.
  const yearsExperience =
    typeof data["yearsExperience"] === "number" ? Math.max(0, Math.min(60, Math.floor(data["yearsExperience"]))) : undefined;

  const ratingAverage =
    typeof data["ratingAverage"] === "number" ? Math.max(0, Math.min(5, data["ratingAverage"])) : undefined;

  // Disqualifiers should be derived from internal checks/flags (booleans).
  const disqualifiersRaw = data["disqualifiers"];
  const disqualifiers =
    disqualifiersRaw && typeof disqualifiersRaw === "object"
      ? {
          policyDisqualifier: Boolean((disqualifiersRaw as any)["policyDisqualifier"]),
          fraudSignal: Boolean((disqualifiersRaw as any)["fraudSignal"]),
          safetyConcern: Boolean((disqualifiersRaw as any)["safetyConcern"]),
        }
      : undefined;

  return {
    driverId,
    hasProfileBasics: hasProfileBasics || undefined,
    hasLocation: hasLocation || undefined,
    hasAvailability: hasAvailability || undefined,
    documentsStatus,
    trainingStatus,
    yearsExperience,
    ratingAverage,
    disqualifiers,
  };
}

/**
 * Maps Firestore driver document data into the minimal DriverCandidateInput for matching.
 *
 * Notes:
 * - Returns only operational signals needed for ranking.
 * - Avoids PII fields.
 */
function mapDriverDocToCandidateInput(driverId: string, data: Record<string, unknown>): DriverCandidateInput {
  const documentsStatusRaw = data["documentsStatus"];
  const trainingStatusRaw = data["trainingStatus"];

  const documentsStatus =
    documentsStatusRaw === "verified" ||
    documentsStatusRaw === "pending" ||
    documentsStatusRaw === "missing" ||
    documentsStatusRaw === "rejected"
      ? documentsStatusRaw
      : undefined;

  const trainingStatus =
    trainingStatusRaw === "complete" ||
    trainingStatusRaw === "incomplete" ||
    trainingStatusRaw === "missing"
      ? trainingStatusRaw
      : undefined;

  // Location is optional; if present, ensure a safe shape.
  const loc = data["location"];
  const driverLocation =
    loc && typeof loc === "object" && typeof (loc as any).lat === "number" && typeof (loc as any).lng === "number"
      ? { lat: (loc as any).lat, lng: (loc as any).lng }
      : undefined;

  const availabilityRaw = data["availability"];
  const availability =
    availabilityRaw === "day" ||
    availabilityRaw === "evening" ||
    availabilityRaw === "night" ||
    availabilityRaw === "weekend" ||
    availabilityRaw === "any"
      ? availabilityRaw
      : undefined;

  const yearsExperience =
    typeof data["yearsExperience"] === "number" ? Math.max(0, Math.min(60, Math.floor(data["yearsExperience"]))) : undefined;

  const ratingAverage =
    typeof data["ratingAverage"] === "number" ? Math.max(0, Math.min(5, data["ratingAverage"])) : undefined;

  const riskRaw = data["risk"];
  const risk =
    riskRaw && typeof riskRaw === "object"
      ? {
          fraudSignal: Boolean((riskRaw as any)["fraudSignal"]),
          safetyConcern: Boolean((riskRaw as any)["safetyConcern"]),
        }
      : undefined;

  return {
    driverId,
    documentsStatus,
    trainingStatus,
    driverLocation,
    availability,
    yearsExperience,
    ratingAverage,
    risk,
  };
}

/**
 * Reads a driver by ID and returns the minimal screening input model.
 *
 * Return values:
 * - null when the driver does not exist
 * - DriverScreeningInput when found
 *
 * Security note:
 * - Authorization must be enforced by the caller (policy guard).
 */
export async function getDriverForScreening(
  deps: DriversRepoDeps,
  driverId: string
): Promise<DriverScreeningInput | null> {
  const doc = await deps.db.collection(COLLECTIONS.drivers).doc(driverId).get();
  if (!doc.exists) return null;

  const data = doc.data();
  if (!data) return null;

  return mapDriverDocToScreeningInput(driverId, data);
}

/**
 * Reads drivers by IDs and returns minimal candidate inputs for matching.
 *
 * Implementation note:
 * - Firestore supports batched gets differently depending on SDK.
 * - This V1 implementation does sequential reads for simplicity and clarity.
 * - For performance, replace with batch operations once requirements are clear.
 *
 * Security note:
 * - Authorization must be enforced by the caller (policy guard).
 */
export async function getDriversForMatching(
  deps: DriversRepoDeps,
  driverIds: string[]
): Promise<DriverCandidateInput[]> {
  const results: DriverCandidateInput[] = [];

  for (const id of driverIds) {
    const doc = await deps.db.collection(COLLECTIONS.drivers).doc(id).get();
    if (!doc.exists) continue;

    const data = doc.data();
    if (!data) continue;

    results.push(mapDriverDocToCandidateInput(id, data));
  }

  return results;
}
