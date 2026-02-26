// src/server/services/insights.service.ts
/**
 * Business Insights Service (V1 — deterministic templates)
 * =============================================================================
 * What this file does
 * -------------------
 * Produces a contract-compliant business insights result:
 * - `answer`: short, operational text (template-driven in V1)
 * - `metrics`: optional structured metrics used to support the answer
 * - `reasonCodes`: structured justification for why the answer is framed
 * - `explanation`: optional display-friendly explanation (provider "none" in V1)
 * - `meta`: audit metadata (contract + policy version)
 *
 * Why this exists
 * ---------------
 * Business users often ask "why" questions that can be answered using
 * simple aggregates and deterministic logic before introducing analytics
 * dashboards or external AI vendors.
 *
 * This service keeps insights:
 * - predictable (no hallucinations)
 * - auditable (metrics included)
 * - low-risk (no external processing)
 *
 * POPIA (South Africa) considerations
 * ----------------------------------
 * - Data minimisation: insights should use aggregated/summary metrics rather
 *   than per-person details.
 * - Purpose specification: insights must support operations (screening/matching
 *   performance) and not unrelated profiling.
 * - Safeguards: avoid disclosing individual driver information in text outputs.
 *
 * IMPORTANT RULE
 * --------------
 * V1 insights are template-based. If an external provider is introduced later,
 * it may improve phrasing but must not introduce new claims that are not
 * supported by included metrics.
 */

import {
  type BusinessInsightsResult,
  type ReasonCode,
} from "../ai/contract";
import { buildMeta, getAIProvider } from "../ai";

/**
 * Policy version for insights logic.
 * Bump when templates or metric thresholds change.
 */
const INSIGHTS_POLICY_VERSION = "insights_rules_v1.0.0";

/**
 * Supported insight questions (V1).
 *
 * Design note:
 * - Limiting to known question categories prevents open-ended outputs and
 *   keeps results auditable.
 * - Additional categories can be added as product needs evolve.
 */
export type InsightQuestionType =
  | "WHY_JOBS_REJECTED"
  | "WHAT_PROFILES_PERFORM_BEST"
  | "HOW_TO_IMPROVE_ACCEPTANCE"
  | "GENERAL_SUMMARY";

/**
 * Minimal insight input metrics (V1).
 *
 * Guidance:
 * - Prefer aggregates rather than individual records.
 * - Use counts and percentages instead of personal data.
 * - If metrics are not available yet, keep them optional and return safe
 *   “insufficient data” responses.
 */
export interface BusinessInsightsInput {
  businessId: string;

  /** The question category being asked. */
  questionType: InsightQuestionType;

  /** Optional time window label for the insight (e.g., "last_30_days"). */
  timeWindow?: "last_7_days" | "last_30_days" | "last_90_days" | "all_time";

  /**
   * Aggregated job outcomes.
   * Example:
   * - jobsPosted: 100
   * - jobsAccepted: 60
   * - jobsRejected: 30
   * - jobsExpired: 10
   */
  jobsPosted?: number;
  jobsAccepted?: number;
  jobsRejected?: number;
  jobsExpired?: number;

  /**
   * Aggregated rejection reasons (if available).
   * Example keys: "LOW_PAY", "DISTANCE_TOO_FAR", "TIME_WINDOW_MISMATCH"
   */
  rejectionReasons?: Record<string, number>;

  /**
   * Aggregated driver stats (if available).
   * Example:
   * - activeDrivers: 80
   * - driversWithVerifiedDocs: 50
   * - driversWithCompleteTraining: 40
   */
  activeDrivers?: number;
  driversWithVerifiedDocs?: number;
  driversWithCompleteTraining?: number;

  /**
   * Job requirement distribution (optional).
   * Example:
   * - jobsRequiringTraining: 70
   * - jobsRequiringVerifiedDocs: 50
   */
  jobsRequiringTraining?: number;
  jobsRequiringVerifiedDocs?: number;

  /**
   * Optional performance buckets (aggregated).
   * Example:
   * - highRatingDrivers: 20
   * - highRatingAcceptanceRate: 0.72
   */
  highRatingDrivers?: number;
  highRatingAcceptanceRate?: number;

  /**
   * Optional pay or incentive signals (aggregated).
   * Example:
   * - avgOfferedPay: 120
   * - avgMarketPay: 140
   */
  avgOfferedPay?: number;
  avgMarketPay?: number;
}

/**
 * Safe division helper.
 * Returns 0 when denominator is 0 or undefined to avoid NaN leakage.
 */
function ratio(n?: number, d?: number): number {
  if (!n || !d) return 0;
  if (d === 0) return 0;
  return n / d;
}

/**
 * Formats a ratio (0..1) as a percentage string.
 * Example: 0.615 -> "61.5%"
 */
function pct(r: number): string {
  const v = Math.max(0, Math.min(1, r));
  return `${(v * 100).toFixed(1)}%`;
}

/**
 * Computes contract-level reason codes based on the availability of metrics.
 *
 * Purpose:
 * - Indicates whether the answer is based on complete data or partial estimates.
 */
function computeInsightReasonCodes(input: BusinessInsightsInput): ReasonCode[] {
  const codes: ReasonCode[] = [];

  // Missing core job metrics reduces confidence and should be visible.
  if (
    input.jobsPosted === undefined ||
    input.jobsAccepted === undefined ||
    input.jobsRejected === undefined
  ) {
    codes.push("MISSING_REQUIRED_FIELDS");
  }

  // Missing training/docs aggregates can affect certain insights.
  if (
    input.questionType === "HOW_TO_IMPROVE_ACCEPTANCE" &&
    (input.driversWithCompleteTraining === undefined ||
      input.driversWithVerifiedDocs === undefined)
  ) {
    codes.push("MISSING_TRAINING");
    codes.push("MISSING_DOCUMENTS");
  }

  if (codes.length === 0) codes.push("RULES_ENGINE_DEFAULT");
  return codes;
}

/**
 * Builds a deterministic answer for "why jobs are being rejected".
 *
 * Strategy:
 * - Use rejectionReasons if provided
 * - Otherwise use acceptance/rejection ratios and provide generic causes
 */
function answerWhyJobsRejected(input: BusinessInsightsInput): {
  answer: string;
  metrics: BusinessInsightsResult["metrics"];
} {
  const posted = input.jobsPosted ?? 0;
  const rejected = input.jobsRejected ?? 0;
  const accepted = input.jobsAccepted ?? 0;

  const rejectRate = ratio(rejected, posted);
  const acceptRate = ratio(accepted, posted);

  // If top rejection reasons exist, summarise top 2–3.
  if (input.rejectionReasons && Object.keys(input.rejectionReasons).length > 0) {
    const sorted = Object.entries(input.rejectionReasons).sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 3).map(([k, v]) => `${k} (${v})`);
    return {
      answer:
        `Rejections are concentrated around a small set of factors: ${top.join(", ")}. ` +
        `Overall acceptance is ${pct(acceptRate)} and rejection is ${pct(rejectRate)} for the selected window.`,
      metrics: {
        jobsPosted: posted,
        jobsAccepted: accepted,
        jobsRejected: rejected,
        acceptanceRate: Number(acceptRate.toFixed(3)),
        rejectionRate: Number(rejectRate.toFixed(3)),
        topRejectionReasons: top.join("; "),
      },
    };
  }

  // Otherwise provide a conservative generic answer with metrics.
  return {
    answer:
      `Rejection is ${pct(rejectRate)} for the selected window. ` +
      `When detailed rejection reasons are not recorded, the most common operational causes tend to be ` +
      `mismatched time windows, pay expectations, and distance/availability constraints.`,
    metrics: {
      jobsPosted: posted,
      jobsAccepted: accepted,
      jobsRejected: rejected,
      acceptanceRate: Number(acceptRate.toFixed(3)),
      rejectionRate: Number(rejectRate.toFixed(3)),
      reasonsAvailable: false,
    },
  };
}

/**
 * Builds a deterministic answer for "what driver profiles perform best".
 *
 * Strategy:
 * - Use provided “high rating” acceptance rate if available
 * - Otherwise provide generic, non-personal profile indicators
 */
function answerWhatProfilesPerformBest(input: BusinessInsightsInput): {
  answer: string;
  metrics: BusinessInsightsResult["metrics"];
} {
  const highRate = input.highRatingAcceptanceRate;

  if (typeof highRate === "number") {
    return {
      answer:
        `Drivers with stronger historical performance show an acceptance rate of ${pct(highRate)} in the selected window. ` +
        `Operationally, the best-performing profiles typically combine verified documents, completed training, and reliable availability.`,
      metrics: {
        highRatingDrivers: input.highRatingDrivers ?? null,
        highRatingAcceptanceRate: Number(highRate.toFixed(3)),
        driversWithVerifiedDocs: input.driversWithVerifiedDocs ?? null,
        driversWithCompleteTraining: input.driversWithCompleteTraining ?? null,
      },
    };
  }

  return {
    answer:
      `The strongest operational profiles are typically those with verified documents, completed training, and consistent availability. ` +
      `When rating and acceptance-rate metrics are available, they should be used to quantify this impact.`,
    metrics: {
      driversWithVerifiedDocs: input.driversWithVerifiedDocs ?? null,
      driversWithCompleteTraining: input.driversWithCompleteTraining ?? null,
      highRatingAcceptanceRate: null,
    },
  };
}

/**
 * Builds a deterministic answer for "how to improve job acceptance".
 *
 * Strategy:
 * - Compare job requirements vs driver readiness (training/docs)
 * - Compare offered pay vs market pay if available
 */
function answerHowToImproveAcceptance(input: BusinessInsightsInput): {
  answer: string;
  metrics: BusinessInsightsResult["metrics"];
} {
  const jobsPosted = input.jobsPosted ?? 0;

  const requireTrainingRate = ratio(input.jobsRequiringTraining, jobsPosted);
  const requireDocsRate = ratio(input.jobsRequiringVerifiedDocs, jobsPosted);

  const driverTrainingRate = ratio(input.driversWithCompleteTraining, input.activeDrivers);
  const driverDocsRate = ratio(input.driversWithVerifiedDocs, input.activeDrivers);

  const payGap =
    typeof input.avgOfferedPay === "number" && typeof input.avgMarketPay === "number"
      ? input.avgMarketPay - input.avgOfferedPay
      : null;

  const recommendations: string[] = [];

  // Alignment between job requirements and driver readiness
  if (requireTrainingRate > driverTrainingRate && jobsPosted > 0) {
    recommendations.push(
      `Increase the pool of trained drivers or reduce training-only job constraints (jobs require training: ${pct(requireTrainingRate)}, drivers trained: ${pct(driverTrainingRate)}).`
    );
  }

  if (requireDocsRate > driverDocsRate && jobsPosted > 0) {
    recommendations.push(
      `Increase the number of drivers with verified documents (jobs require verified docs: ${pct(requireDocsRate)}, drivers verified: ${pct(driverDocsRate)}).`
    );
  }

  // Pay signal (if available)
  if (payGap !== null && payGap > 0) {
    recommendations.push(
      `Offered pay is below the market average by approximately ${payGap.toFixed(0)} (units). Consider adjusting incentives to improve acceptance.`
    );
  }

  if (recommendations.length === 0) {
    recommendations.push(
      "Improve acceptance by aligning job schedules with driver availability, clarifying job requirements, and ensuring sufficient trained/verified driver supply."
    );
  }

  return {
    answer: recommendations.join(" "),
    metrics: {
      jobsPosted: jobsPosted,
      activeDrivers: input.activeDrivers ?? null,
      jobsRequiringTrainingRate: Number(requireTrainingRate.toFixed(3)),
      jobsRequiringVerifiedDocsRate: Number(requireDocsRate.toFixed(3)),
      driversWithCompleteTrainingRate: Number(driverTrainingRate.toFixed(3)),
      driversWithVerifiedDocsRate: Number(driverDocsRate.toFixed(3)),
      avgOfferedPay: input.avgOfferedPay ?? null,
      avgMarketPay: input.avgMarketPay ?? null,
      payGap: payGap !== null ? Number(payGap.toFixed(2)) : null,
    },
  };
}

/**
 * Builds a general summary when a specific question type is not provided.
 */
function answerGeneralSummary(input: BusinessInsightsInput): {
  answer: string;
  metrics: BusinessInsightsResult["metrics"];
} {
  const posted = input.jobsPosted ?? 0;
  const accepted = input.jobsAccepted ?? 0;
  const rejected = input.jobsRejected ?? 0;

  const acceptRate = ratio(accepted, posted);
  const rejectRate = ratio(rejected, posted);

  return {
    answer:
      `For the selected window, acceptance is ${pct(acceptRate)} and rejection is ${pct(rejectRate)}. ` +
      `Operational improvements typically focus on availability alignment, sufficient trained/verified driver supply, and competitive incentives.`,
    metrics: {
      jobsPosted: posted,
      jobsAccepted: accepted,
      jobsRejected: rejected,
      acceptanceRate: Number(acceptRate.toFixed(3)),
      rejectionRate: Number(rejectRate.toFixed(3)),
      activeDrivers: input.activeDrivers ?? null,
    },
  };
}

/**
 * Public API: generates a business insight response.
 *
 * Implementation outline:
 * 1) compute reason codes and confidence from metric availability
 * 2) generate deterministic answer via templates + metrics
 * 3) generate explanation via provider (V1 = none templates)
 * 4) return contract-compliant result with audit metadata
 */
export async function generateBusinessInsight(params: {
  input: BusinessInsightsInput;
  traceId?: string;
}): Promise<BusinessInsightsResult> {
  const { input, traceId } = params;

  const provider = getAIProvider();

  // Contract-level reason codes reflect data availability and template constraints.
  const reasonCodes = computeInsightReasonCodes(input);

  // Confidence reflects whether the insight is backed by adequate metrics.
  const confidence = reasonCodes.includes("MISSING_REQUIRED_FIELDS") ? 0.7 : 1.0;

  // Deterministic answer selection by question type.
  let built: { answer: string; metrics: BusinessInsightsResult["metrics"] };

  switch (input.questionType) {
    case "WHY_JOBS_REJECTED":
      built = answerWhyJobsRejected(input);
      break;
    case "WHAT_PROFILES_PERFORM_BEST":
      built = answerWhatProfilesPerformBest(input);
      break;
    case "HOW_TO_IMPROVE_ACCEPTANCE":
      built = answerHowToImproveAcceptance(input);
      break;
    case "GENERAL_SUMMARY":
    default:
      built = answerGeneralSummary(input);
      break;
  }

  // Provider explanation is derived from reason codes and the presence/absence of metrics.
  // The provider must not invent facts; it should rephrase based on structured signals.
  const explanation = await provider.explain({
    feature: "business_insights",
    reasonCodes,
    score: undefined,
    decision: undefined,
    missingFields: reasonCodes.includes("MISSING_REQUIRED_FIELDS") ? ["other"] : undefined,
    riskFlags: undefined,
  });

  // Contract-level metadata
  const meta = buildMeta({
    provider: provider.name,
    policyVersion: INSIGHTS_POLICY_VERSION,
    traceId,
  });

  return {
    feature: "business_insights",
    meta,
    confidence,
    reasonCodes,
    answer: built.answer,
    metrics: built.metrics,
    explanation,
  };
}
