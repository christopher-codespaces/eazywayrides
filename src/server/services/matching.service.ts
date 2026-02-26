// src/server/services/matching.service.ts
/**
 * Job-to-Driver Matching Service (V1 — deterministic rules)
 * =============================================================================
 * What this file does
 * -------------------
 * Produces a contract-compliant job matching result:
 * - ranked candidate list (best → worst)
 * - per-candidate scores and reason codes
 * - optional explanation (provider "none" in V1)
 * - audit metadata for policy/version tracing
 *
 * Why this exists
 * ---------------
 * Matching logic tends to get duplicated across routes and UI, causing:
 * - inconsistent recommendations
 * - difficult debugging
 * - unclear decision rationale
 *
 * Centralising matching as a service ensures consistent ranking and improves
 * maintainability.
 *
 * POPIA (South Africa) considerations
 * ----------------------------------
 * - Data minimisation: inputs should use operational signals (availability,
 *   distance, qualification flags), not PII.
 * - Purpose specification: matching is used strictly to recommend assignments.
 * - Safeguards: outputs should avoid personal identifiers; return internal IDs
 *   and structured reasons instead.
 *
 * IMPORTANT RULE
 * --------------
 * Decisions and scores are produced by deterministic rules in this service.
 * Providers may only generate `explanation` fields and must not alter:
 * - candidate order
 * - candidate scores
 * - reason codes
 */

import {
  clampScore0to100,
  type JobMatchingResult,
  type MatchCandidate,
  type ReasonCode,
  type RiskFlag,
} from "../ai/contract";
import { buildMeta, getAIProvider } from "../ai";

/**
 * Policy version for matching rules.
 * Bump whenever weights/thresholds/constraints change.
 */
const MATCHING_POLICY_VERSION = "matching_rules_v1.0.0";

/**
 * Minimal input model for a job posting used by matching.
 *
 * Design notes:
 * - Keeps the matching engine decoupled from Firestore document shapes.
 * - Uses simple, auditable fields rather than free-text.
 */
export interface JobMatchingInput {
  jobId: string;

  /** Constraint signals */
  requiresTraining?: boolean;
  requiresVerifiedDocuments?: boolean;

  /** Operational factors */
  jobLocation?: { lat: number; lng: number };
  maxDistanceKm?: number;

  /** Scheduling constraints */
  requiredTimeWindow?: "day" | "evening" | "night" | "weekend" | "any";

  /** Optional preference weights (V1 can ignore or lightly apply) */
  preferHighRating?: boolean;
  preferExperience?: boolean;
}

/**
 * Minimal driver profile used by matching.
 *
 * Privacy note:
 * - This data should not include names, phone numbers, emails, or raw notes.
 * - The output uses only driverId and structured reasons.
 */
export interface DriverCandidateInput {
  driverId: string;

  /** Eligibility signals */
  documentsStatus?: "verified" | "pending" | "missing" | "rejected";
  trainingStatus?: "complete" | "incomplete" | "missing";

  /** Operational signals */
  driverLocation?: { lat: number; lng: number };
  availability?: "day" | "evening" | "night" | "weekend" | "any";

  /** Optional performance signals */
  yearsExperience?: number;
  ratingAverage?: number; // 0..5

  /** Risk signals that should trigger review rather than automatic selection */
  risk?: {
    fraudSignal?: boolean;
    safetyConcern?: boolean;
  };
}

/**
 * Computes approximate distance in KM using the Haversine formula.
 *
 * Why it exists:
 * - Matching often requires a distance penalty/threshold.
 *
 * Note:
 * - Distance estimation is approximate; if a mapping API is introduced later,
 *   this can be replaced without changing the public service contract.
 */
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;

  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * (sinDLng * sinDLng);

  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Maps driver/job signals into risk flags.
 *
 * Risk flags are intended to:
 * - deprioritise a candidate
 * - surface manual review needs
 * - maintain audit visibility
 */
function computeCandidateRiskFlags(driver: DriverCandidateInput): RiskFlag[] {
  const flags: RiskFlag[] = [];

  if (driver.risk?.fraudSignal) flags.push("FRAUD_SIGNAL");
  if (driver.risk?.safetyConcern) flags.push("SAFETY_CONCERN");
  if (driver.documentsStatus === "rejected") flags.push("DOCUMENT_SUSPICIOUS");

  return flags;
}

/**
 * Determines whether a driver satisfies hard constraints for the job.
 *
 * Why it exists:
 * - Matching should not recommend candidates that cannot legally/operationally
 *   perform the job based on known constraints.
 *
 * Return values:
 * - ok: hard constraints satisfied
 * - missing: evaluation cannot confirm (insufficient information)
 * - fail: hard constraint violated
 */
function evaluateHardConstraints(params: {
  job: JobMatchingInput;
  driver: DriverCandidateInput;
}): { status: "ok" | "missing" | "fail"; reasons: ReasonCode[] } {
  const { job, driver } = params;
  const reasons: ReasonCode[] = [];

  // Document constraint
  if (job.requiresVerifiedDocuments) {
    if (!driver.documentsStatus) {
      reasons.push("MISSING_DOCUMENTS");
      return { status: "missing", reasons };
    }
    if (driver.documentsStatus !== "verified") {
      reasons.push("MISSING_DOCUMENTS");
      return { status: "fail", reasons };
    }
  }

  // Training constraint
  if (job.requiresTraining) {
    if (!driver.trainingStatus) {
      reasons.push("MISSING_TRAINING");
      return { status: "missing", reasons };
    }
    if (driver.trainingStatus !== "complete") {
      reasons.push("MISSING_TRAINING");
      return { status: "fail", reasons };
    }
  }

  return { status: "ok", reasons };
}

/**
 * Computes reason codes for candidate fit (distance, availability, rating, experience).
 *
 * Reason codes provide structured explainability for ranking.
 */
function computeFitReasonCodes(params: {
  job: JobMatchingInput;
  driver: DriverCandidateInput;
  distanceKm?: number;
}): ReasonCode[] {
  const { job, driver, distanceKm } = params;
  const codes: ReasonCode[] = [];

  // Availability fit
  const required = job.requiredTimeWindow ?? "any";
  const avail = driver.availability ?? "any";
  if (required === "any" || avail === "any" || required === avail) {
    codes.push("AVAILABILITY_MATCH");
  } else {
    codes.push("AVAILABILITY_MISMATCH");
  }

  // Distance fit (only when both locations exist)
  if (typeof distanceKm === "number") {
    const maxKm = job.maxDistanceKm ?? 20;
    if (distanceKm <= maxKm) codes.push("DISTANCE_OK");
    else codes.push("DISTANCE_FAR");
  }

  // Experience fit
  if (typeof driver.yearsExperience === "number") {
    if (driver.yearsExperience >= 2) codes.push("STRONG_EXPERIENCE_MATCH");
    else codes.push("WEAK_EXPERIENCE_MATCH");
  }

  // Rating fit
  if (typeof driver.ratingAverage === "number") {
    if (driver.ratingAverage >= 4.5) codes.push("RATING_HIGH");
    else if (driver.ratingAverage < 3.5) codes.push("RATING_LOW");
  }

  if (codes.length === 0) codes.push("RULES_ENGINE_DEFAULT");
  return codes;
}

/**
 * Computes a deterministic candidate score (0–100).
 *
 * Scoring strategy (V1 baseline):
 * - Start at 0
 * - Add points for constraint satisfaction, then for fit signals
 * - Apply penalties for mismatches and distance
 * - Deprioritise risk flags
 *
 * Note:
 * - This is a placeholder scoring system until owners confirm weights.
 */
function computeCandidateScore(params: {
  job: JobMatchingInput;
  driver: DriverCandidateInput;
  distanceKm?: number;
  hardConstraintStatus: "ok" | "missing" | "fail";
  riskFlags: RiskFlag[];
}): number {
  const { job, driver, distanceKm, hardConstraintStatus, riskFlags } = params;

  let score = 0;

  // Hard constraints
  if (hardConstraintStatus === "ok") score += 30;
  if (hardConstraintStatus === "missing") score += 10;
  if (hardConstraintStatus === "fail") score += 0;

  // Availability alignment
  const required = job.requiredTimeWindow ?? "any";
  const avail = driver.availability ?? "any";
  const availMatch = required === "any" || avail === "any" || required === avail;
  score += availMatch ? 20 : -25;

  // Distance contribution
  if (typeof distanceKm === "number") {
    const maxKm = job.maxDistanceKm ?? 20;
    // Within max distance: reward; beyond: penalise.
    if (distanceKm <= maxKm) score += 15;
    else score -= Math.min(30, Math.round((distanceKm - maxKm) * 2));
  } else {
    // Unknown distance: neutral
    score += 0;
  }

  // Performance signals
  if (job.preferExperience && typeof driver.yearsExperience === "number") {
    score += driver.yearsExperience >= 2 ? 10 : 3;
  } else if (typeof driver.yearsExperience === "number") {
    score += driver.yearsExperience >= 2 ? 6 : 2;
  }

  if (job.preferHighRating && typeof driver.ratingAverage === "number") {
    score += driver.ratingAverage >= 4.5 ? 10 : driver.ratingAverage >= 4.0 ? 6 : 0;
  } else if (typeof driver.ratingAverage === "number") {
    score += driver.ratingAverage >= 4.5 ? 6 : driver.ratingAverage >= 4.0 ? 3 : 0;
  }

  // Risk penalty (risk flags should push candidates down the list).
  if (riskFlags.length > 0) score -= riskFlags.length * 10;

  return clampScore0to100(score);
}

/**
 * Public API: ranks drivers for a job and returns a contract-compliant result.
 *
 * Implementation outline:
 * 1) compute per-candidate distance (if possible)
 * 2) evaluate hard constraints
 * 3) compute risk flags and reason codes
 * 4) compute deterministic score
 * 5) sort and return top candidates
 * 6) generate explanations via provider (V1 = none templates)
 */
export async function matchDriversToJob(params: {
  job: JobMatchingInput;
  drivers: DriverCandidateInput[];
  traceId?: string;
  limit?: number;
}): Promise<JobMatchingResult> {
  const { job, drivers, traceId, limit = 5 } = params;

  const provider = getAIProvider();

  // Build candidate list with deterministic scoring.
  const candidatesScored: Array<{
    candidate: MatchCandidate;
    riskFlags: RiskFlag[];
    hardStatus: "ok" | "missing" | "fail";
  }> = [];

  for (const driver of drivers) {
    // Distance only computed when both locations are available.
    const distanceKm =
      job.jobLocation && driver.driverLocation
        ? haversineKm(job.jobLocation, driver.driverLocation)
        : undefined;

    // Hard constraints determine whether a candidate is viable at all.
    const hard = evaluateHardConstraints({ job, driver });

    // Risk flags should not automatically discard the candidate, but should
    // reduce score and trigger review by the business.
    const riskFlags = computeCandidateRiskFlags(driver);

    // Base reason codes include hard constraint reasons, plus fit reasons.
    const fitReasonCodes = computeFitReasonCodes({ job, driver, distanceKm });
    const reasonCodes: ReasonCode[] = [...hard.reasons, ...fitReasonCodes];

    // Score is computed deterministically and clamped to 0..100.
    const score = computeCandidateScore({
      job,
      driver,
      distanceKm,
      hardConstraintStatus: hard.status,
      riskFlags,
    });

    // Explanation is derived from structured signals only.
    const explanation = await provider.explain({
      feature: "job_matching",
      reasonCodes,
      score,
      decision: undefined, // matching does not use accept/reject; it ranks candidates
      missingFields: hard.status === "missing" ? ["documents", "training"] : undefined,
      riskFlags,
    });

    candidatesScored.push({
      candidate: {
        driverId: driver.driverId,
        score,
        reasonCodes,
        riskFlags: riskFlags.length ? riskFlags : undefined,
        explanation,
      },
      riskFlags,
      hardStatus: hard.status,
    });
  }

  // Sorting strategy:
  // - Primary: score descending
  // - Secondary: prefer candidates that satisfy hard constraints (ok > missing > fail)
  // This prevents "fail" candidates from ranking above viable candidates
  // when scores are close due to limited data.
  const hardRank = (s: "ok" | "missing" | "fail"): number => (s === "ok" ? 2 : s === "missing" ? 1 : 0);

  candidatesScored.sort((a, b) => {
    const byScore = b.candidate.score - a.candidate.score;
    if (byScore !== 0) return byScore;
    return hardRank(b.hardStatus) - hardRank(a.hardStatus);
  });

  const topCandidates = candidatesScored.slice(0, limit).map((x) => x.candidate);

  // Confidence reflects whether a meaningful ranking is available.
  // - Lower confidence when most candidates have missing hard-constraint data.
  const missingHeavy = candidatesScored.filter((x) => x.hardStatus === "missing").length;
  const confidence = drivers.length === 0 ? 0 : missingHeavy / Math.max(1, drivers.length) > 0.5 ? 0.7 : 1.0;

  // Provide a note when no candidates exist or the top candidates are not viable.
  const note =
    drivers.length === 0
      ? "No available drivers were provided for matching."
      : topCandidates.length === 0
        ? "No candidates are available."
        : undefined;

  // Contract-level metadata
  const meta = buildMeta({
    provider: provider.name,
    policyVersion: MATCHING_POLICY_VERSION,
    traceId,
  });

  // Contract-level reason codes summarize the overall match outcome.
  // Candidate-level reasons remain the primary justification.
  const overallReasonCodes: ReasonCode[] =
    topCandidates.length > 0 ? ["RULES_ENGINE_DEFAULT"] : ["MISSING_REQUIRED_FIELDS"];

  return {
    feature: "job_matching",
    meta,
    confidence,
    reasonCodes: overallReasonCodes,
    candidates: topCandidates,
    note,
  };
}
