/**
 * Local smoke test for AI/security overlay (no Firebase required).
 * Runs deterministic services with sample input.
 */

import { evaluateDriverScreening } from "@/server/services/screening.service";
import { matchDriversToJob } from "@/server/services/matching.service";
import { generateBusinessInsight } from "@/server/services/insights.service";

async function run() {
  const screening = await evaluateDriverScreening({
    input: {
      driverId: "driver_1",
      hasProfileBasics: true,
      hasLocation: true,
      hasAvailability: true,
      documentsStatus: "verified",
      trainingStatus: "complete",
      yearsExperience: 3,
      ratingAverage: 4.7,
      disqualifiers: { policyDisqualifier: false },
    },
    traceId: "local-trace",
  });

  console.log("SCREENING RESULT:", screening);

  const matching = await matchDriversToJob({
    job: {
      jobId: "job_1",
      requiresTraining: true,
      requiresVerifiedDocuments: true,
      jobLocation: { lat: -26.2041, lng: 28.0473 },
      maxDistanceKm: 20,
      requiredTimeWindow: "day",
      preferHighRating: true,
    },
    drivers: [
      {
        driverId: "driver_1",
        documentsStatus: "verified",
        trainingStatus: "complete",
        driverLocation: { lat: -26.2041, lng: 28.0473 },
        availability: "day",
        yearsExperience: 3,
        ratingAverage: 4.7,
      },
      {
        driverId: "driver_2",
        documentsStatus: "pending",
        trainingStatus: "missing",
        driverLocation: { lat: -26.3, lng: 28.1 },
        availability: "night",
        yearsExperience: 1,
        ratingAverage: 3.2,
        risk: { fraudSignal: true },
      },
    ],
    traceId: "local-trace",
    limit: 2,
  });

  console.log("MATCHING RESULT:", matching);

  const insights = await generateBusinessInsight({
    input: {
      businessId: "biz_1",
      questionType: "WHY_JOBS_REJECTED",
      timeWindow: "last_30_days",
      jobsPosted: 100,
      jobsAccepted: 60,
      jobsRejected: 30,
      jobsExpired: 10,
      rejectionReasons: {
        DISTANCE_TOO_FAR: 12,
        LOW_PAY: 10,
        TIME_WINDOW_MISMATCH: 8,
      },
    },
    traceId: "local-trace",
  });

  console.log("INSIGHTS RESULT:", insights);
}

run().catch((e) => {
  console.error("SMOKE TEST FAILED:", e);
  process.exit(1);
});
