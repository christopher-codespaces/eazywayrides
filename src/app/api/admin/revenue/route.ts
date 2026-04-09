// src/app/api/admin/revenue/route.ts
/**
 * GET /api/admin/revenue
 *
 * Returns aggregated revenue stats derived exclusively from completed,
 * processed PayFast ITN payments in Firestore.
 *
 * Security:
 * - Requires a valid Firebase ID token with admin role.
 * - Only payments where status === "completed" AND processed === true are counted.
 * - Revenue is computed server-side (cents → ZAR) before returning.
 */

import "server-only";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/requireAdmin";

export async function GET(req: Request) {
  // ── Auth check ──────────────────────────────────────────────────────────────
  const authError = await requireAdmin(req as any);
  if (authError) return authError;

  // ── Firestore reference ────────────────────────────────────────────────────
  const db = getAdminDb();
  const paymentsRef = db.collection("payments");

  // ── Query: all completed + processed payments ────────────────────────────────
  // We fetch in two batches to stay within query limits while calculating totals.
  const completedQuery = paymentsRef
    .where("status", "==", "completed")
    .where("processed", "==", true);

  const [allDocsSnap, todayStart, monthStart, sevenDaysAgo] = await Promise.all([
    completedQuery.get(),
    // Start of today (local SA time)
    getStartOfToday(),
    getStartOfMonth(),
    getDateDaysAgo(7),
  ]);

  const allDocs = allDocsSnap.docs;

  // ── Guard: no payments ───────────────────────────────────────────────────────
  if (allDocs.length === 0) {
    return NextResponse.json({
      totalRevenue: 0,
      totalPayments: 0,
      totalCreditsSold: 0,
      revenueToday: 0,
      revenueThisMonth: 0,
      averageOrderValue: 0,
      chartData: [],
      recentPayments: [],
    });
  }

  // ── Totals ───────────────────────────────────────────────────────────────────
  let totalRevenueCents = 0;
  let totalCreditsSold = 0;

  for (const doc of allDocs) {
    const d = doc.data();
    totalRevenueCents += Number(d.amount) || 0;
    totalCreditsSold += Number(d.credits) || 0;
  }

  const totalRevenue = Number((totalRevenueCents / 100).toFixed(2));
  const averageOrderValue =
    allDocs.length > 0
      ? Number((totalRevenue / allDocs.length).toFixed(2))
      : 0;

  // ── Revenue Today ───────────────────────────────────────────────────────────
  let revenueTodayCents = 0;
  for (const doc of allDocs) {
    const d = doc.data();
    const createdAt = d.createdAt?.toDate?.();
    if (createdAt && createdAt >= todayStart) {
      revenueTodayCents += Number(d.amount) || 0;
    }
  }
  const revenueToday = Number((revenueTodayCents / 100).toFixed(2));

  // ── Revenue This Month ───────────────────────────────────────────────────────
  let revenueThisMonthCents = 0;
  for (const doc of allDocs) {
    const d = doc.data();
    const createdAt = d.createdAt?.toDate?.();
    if (createdAt && createdAt >= monthStart) {
      revenueThisMonthCents += Number(d.amount) || 0;
    }
  }
  const revenueThisMonth = Number((revenueThisMonthCents / 100).toFixed(2));

  // ── Chart Data: last 7 days ─────────────────────────────────────────────────
  const chartDataMap = new Map<string, number>(); // "YYYY-MM-DD" → cents

  // Initialise all 7 days with 0
  for (let i = 6; i >= 0; i--) {
    const d = getDateDaysAgo(i);
    chartDataMap.set(dateToYMD(d), 0);
  }

  for (const doc of allDocs) {
    const d = doc.data();
    const createdAt = d.createdAt?.toDate?.();
    if (createdAt && createdAt >= sevenDaysAgo) {
      const key = dateToYMD(createdAt);
      if (chartDataMap.has(key)) {
        chartDataMap.set(key, (chartDataMap.get(key) ?? 0) + (Number(d.amount) || 0));
      }
    }
  }

  const chartData = Array.from(chartDataMap.entries()).map(([date, cents]) => ({
    date,
    revenue: Number((cents / 100).toFixed(2)),
  }));

  // ── Recent Payments (last 10, sorted desc) ─────────────────────────────────
  const recentSnap = await paymentsRef
    .where("status", "==", "completed")
    .where("processed", "==", true)
    .orderBy("createdAt", "desc")
    .limit(10)
    .get();

  const recentPayments = recentSnap.docs.map((doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      amount: Number(((Number(d.amount) || 0) / 100).toFixed(2)),
      credits: Number(d.credits) || 0,
      userId: d.userId || "-",
      createdAt: d.createdAt?.toDate?.().toISOString() ?? null,
    };
  });

  return NextResponse.json({
    totalRevenue,
    totalPayments: allDocs.length,
    totalCreditsSold,
    revenueToday,
    revenueThisMonth,
    averageOrderValue,
    chartData,
    recentPayments,
  });
}

// ── Date helpers (local SA time) ───────────────────────────────────────────────

function getStartOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function getStartOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function getDateDaysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateToYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
