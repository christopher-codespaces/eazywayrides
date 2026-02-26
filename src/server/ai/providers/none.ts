// src/server/ai/providers/none.ts
/**
 * Provider: "none" (V1 default)
 * =============================================================================
 * What this file does
 * -------------------
 * Implements a vendor-free provider that converts structured evaluation outputs
 * (reason codes, risk flags, missing fields, score/decision) into a safe,
 * human-readable explanation object.
 *
 * This provider is intentionally deterministic:
 * - No network calls
 * - No model inference
 * - No external dependencies
 *
 * Where this is used
 * ------------------
 * Services (screening/matching/insights) can call `provider.explain(...)` to
 * obtain a display-friendly explanation without changing the underlying
 * decision logic.
 *
 * Safety rule (non-negotiable)
 * ----------------------------
 * Provider output MUST NOT modify:
 * - score
 * - decision
 * - reasonCodes
 * The provider is explanation-only.
 *
 * POPIA (South Africa) considerations
 * ----------------------------------
 * - Data minimisation: explanation generation uses only non-PII signals.
 * - Purpose specification: output supports operational evaluation only.
 * - Safeguards: explanation avoids personal identifiers and sensitive details.
 */

import type { AIProviderName, Explanation, ReasonCode } from "../contract";

/**
 * Minimal provider interface used by the AI module.
 *
 * Rationale:
 * - A small interface reduces coupling with services/routes.
 * - Future providers can be swapped in without refactoring call sites.
 */
export interface AIProvider {
  /** Provider identifier used in metadata/audit trails. */
  name: AIProviderName;

  /**
   * Generates an explanation from structured signals.
   *
   * Input design notes:
   * - Uses reason codes, flags, and missing field labels (non-PII).
   * - Accepts optional score/decision for summary text.
   * - Keeps `feature` as a string to avoid tight coupling to feature unions.
   */
  explain(input: {
    feature: string;
    reasonCodes: ReasonCode[];
    score?: number;
    decision?: string;
    missingFields?: string[];
    riskFlags?: string[];
  }): Promise<Explanation>;
}

/**
 * Converts a reason code into a concise concern statement.
 *
 * Output constraints:
 * - Avoids personal identifiers.
 * - Avoids disclosing internal scoring thresholds.
 * - Focuses on actionable operational meaning.
 */
function reasonCodeToConcern(code: ReasonCode): string {
  switch (code) {
    // Missing/incomplete inputs
    case "MISSING_REQUIRED_FIELDS":
      return "Required information is missing.";
    case "MISSING_DOCUMENTS":
      return "Required documents are missing or incomplete.";
    case "MISSING_TRAINING":
      return "Required training is incomplete.";
    case "INCOMPLETE_PROFILE":
      return "The profile is incomplete.";

    // Risk/compliance signals
    case "HIGH_RISK_FLAG":
      return "Risk signals require manual review.";
    case "POLICY_DISQUALIFIER":
      return "A policy disqualifier was detected and requires review.";
    case "LOW_TRUST_SIGNAL":
      return "Some trust signals are weak or missing.";

    // Fit/scoring signals
    case "WEAK_EXPERIENCE_MATCH":
      return "Experience does not strongly match requirements.";
    case "AVAILABILITY_MISMATCH":
      return "Availability does not match requirements.";
    case "DISTANCE_FAR":
      return "Distance may be unsuitable for the job.";
    case "RATING_LOW":
      return "Historical performance/rating is below preferred levels.";

    // Default/fallback
    default:
      return "Additional review may be required.";
  }
}

/**
 * Converts a reason code into a concise strength statement.
 *
 * Design note:
 * - Not all reason codes map to strengths; those return null.
 * - Strengths are optional to prevent noisy output for weak candidates.
 */
function reasonCodeToStrength(code: ReasonCode): string | null {
  switch (code) {
    case "STRONG_EXPERIENCE_MATCH":
      return "Experience aligns well with the requirements.";
    case "AVAILABILITY_MATCH":
      return "Availability matches the requirements.";
    case "DISTANCE_OK":
      return "Location/distance appears suitable.";
    case "RATING_HIGH":
      return "Historical performance/rating is strong.";
    default:
      return null;
  }
}

/**
 * Assembles a short summary from the structured input.
 *
 * The summary intentionally avoids:
 * - listing all reason codes verbatim
 * - exposing internal weights/thresholds
 *
 * It provides:
 * - score/decision (if present)
 * - high-level action cues for missing data and risk flags
 */
function buildSummary(input: {
  score?: number;
  decision?: string;
  missingFields?: string[];
  riskFlags?: string[];
}): string {
  const parts: string[] = [];

  // Score/decision are optional because some features may not provide them.
  if (typeof input.score === "number") parts.push(`Score: ${input.score}/100.`);
  if (input.decision) parts.push(`Decision: ${input.decision}.`);

  // Missing fields implies evaluation cannot be fully completed.
  if (input.missingFields && input.missingFields.length > 0) {
    parts.push("Missing information must be provided.");
  }

  // Risk flags imply heightened attention regardless of score.
  if (input.riskFlags && input.riskFlags.length > 0) {
    parts.push("Risk flags require manual review.");
  }

  // Fall back to a minimal sentence if nothing else is available.
  return parts.length ? parts.join(" ") : "Evaluation summary is available.";
}

/**
 * Computes a recommended next action using the same structured signals.
 *
 * Priority order:
 * 1) Missing fields → request missing info, then re-run evaluation.
 * 2) Risk flags → manual review, then proceed per policy.
 * 3) Otherwise → proceed per policy/capacity.
 */
function buildRecommendedNextAction(input: {
  missingFields?: string[];
  riskFlags?: string[];
}): string {
  if (input.missingFields && input.missingFields.length > 0) {
    return "Request the missing information/documents and re-run the evaluation.";
  }
  if (input.riskFlags && input.riskFlags.length > 0) {
    return "Perform a manual review of the flagged risks before proceeding.";
  }
  return "Proceed according to business policy and operational capacity.";
}

/**
 * Default provider implementation.
 *
 * What the method returns:
 * - `summary`: short, operational text
 * - `strengths`: optional bullets derived from strength-type reason codes
 * - `concerns`: optional bullets derived from concern-type reason codes
 * - `recommendedNextAction`: action guidance derived from missing/risk signals
 *
 * Why it is safe:
 * - Uses only structured signals (no raw application text).
 * - Does not output personal identifiers.
 * - Does not modify decisions/scores.
 */
export const noneProvider: AIProvider = {
  name: "none",

  async explain(input) {
    // Strengths are derived from reason codes that explicitly represent positives.
    const strengths = input.reasonCodes
      .map(reasonCodeToStrength)
      .filter((x): x is string => Boolean(x));

    // Concerns are derived from all reason codes as generic operational statements.
    // This keeps explanations consistent even when new codes are introduced.
    const concerns = input.reasonCodes.map(reasonCodeToConcern);

    // Summary is assembled from high-level signals (score/decision/missing/risk).
    const summary = buildSummary({
      score: input.score,
      decision: input.decision,
      missingFields: input.missingFields,
      riskFlags: input.riskFlags,
    });

    // Next action prioritizes missing information first, then risk review.
    const recommendedNextAction = buildRecommendedNextAction({
      missingFields: input.missingFields,
      riskFlags: input.riskFlags,
    });

    // Explanation object is returned in the contract-defined shape.
    // Optional arrays are omitted when empty to keep payloads clean.
    return {
      summary,
      strengths: strengths.length ? strengths : undefined,
      concerns: concerns.length ? concerns : undefined,
      recommendedNextAction,
    };
  },
};
