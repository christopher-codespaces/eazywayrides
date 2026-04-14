"use client";

import dynamic from "next/dynamic";
import { useState, useEffect } from "react";
import { getAuth } from "firebase/auth";
import { app } from "@/lib/firebase";

const RevenueChartClient = dynamic(() => import("./RevenueChartClient"), {
  ssr: false,
  loading: () => (
    <div className="h-64 bg-gray-100 rounded animate-pulse" />
  ),
});

type RecentPayment = {
  id: string;
  amount: number;
  credits: number;
  userId: string;
  createdAt: string | null;
};

type RevenueData = {
  totalRevenue: number;
  totalPayments: number;
  totalCreditsSold: number;
  revenueToday: number;
  revenueThisMonth: number;
  averageOrderValue: number;
  chartData: { date: string; revenue: number }[];
  recentPayments: RecentPayment[];
};

function SkeletonCard() {
  return (
    <div className="p-4 bg-white rounded-lg shadow animate-pulse space-y-2">
      <div className="h-4 bg-gray-200 rounded w-2/3" />
      <div className="h-8 bg-gray-200 rounded w-1/2" />
      <div className="h-3 bg-gray-200 rounded w-1/3" />
    </div>
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default function AdminRevenuePage() {
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const auth = getAuth(app);
        const user = auth.currentUser;
        if (!user) {
          setError("Not authenticated. Please log in.");
          setLoading(false);
          return;
        }

        // Force token refresh to get latest custom claims (admin: true)
        await user.getIdToken(true);

        // Get the refreshed token
        const token = await user.getIdToken();

        // Debug: decode and log claims to verify admin claim is present
        const decoded = JSON.parse(atob(token.split(".")[1]));
        console.log("TOKEN CLAIMS:", decoded);
        if (!decoded.admin) {
          console.warn(
            "⚠️ admin claim missing! Did you set it and refresh the token?"
          );
        }

        const res = await fetch("/api/admin/revenue", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setData(json);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load revenue data"
        );
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-semibold">Revenue Dashboard</h1>
        <span className="text-xs text-gray-500">All data from verified ITN payments</span>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* KPI Cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            <KpiCard
              label="Total Revenue"
              value={formatCurrency(data?.totalRevenue ?? 0)}
              sub={`${data?.totalPayments ?? 0} payments`}
              accent
            />
            <KpiCard
              label="Revenue Today"
              value={formatCurrency(data?.revenueToday ?? 0)}
              sub="Today"
            />
            <KpiCard
              label="Revenue This Month"
              value={formatCurrency(data?.revenueThisMonth ?? 0)}
              sub="Current month"
            />
            <KpiCard
              label="Credits Sold"
              value={(data?.totalCreditsSold ?? 0).toLocaleString()}
              sub="Total credits"
            />
          </>
        )}
      </section>

      {/* Secondary stats */}
      {!loading && data && (
        <section className="grid grid-cols-2 gap-3 md:gap-4">
          <div className="p-4 bg-white rounded-lg shadow">
            <p className="text-sm text-gray-500">Average Order Value</p>
            <p className="text-xl font-bold mt-1">
              {formatCurrency(data.averageOrderValue)}
            </p>
          </div>
          <div className="p-4 bg-white rounded-lg shadow">
            <p className="text-sm text-gray-500">Total Payments</p>
            <p className="text-xl font-bold mt-1">
              {data.totalPayments.toLocaleString()}
            </p>
          </div>
        </section>
      )}

      {/* Chart — last 7 days */}
      <section className="p-4 md:p-6 bg-white rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-4">Revenue — Last 7 Days</h2>
        {loading ? (
          <div className="h-64 animate-pulse bg-gray-100 rounded" />
        ) : data?.chartData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
            No revenue data in the last 7 days
          </div>
        ) : (
          <RevenueChartClient chartData={data?.chartData ?? []} />
        )}
      </section>

      {/* Recent Payments Table */}
      <section className="p-4 md:p-6 bg-white rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-4">Recent Payments</h2>
        {loading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 animate-pulse bg-gray-100 rounded" />
            ))}
          </div>
        ) : data?.recentPayments.length === 0 ? (
          <p className="text-gray-400 text-sm py-8 text-center">No recent payments</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 pr-4 font-medium text-gray-600">
                    Amount
                  </th>
                  <th className="text-left py-2 pr-4 font-medium text-gray-600">
                    Credits
                  </th>
                  <th className="text-left py-2 pr-4 font-medium text-gray-600">
                    User ID
                  </th>
                  <th className="text-left py-2 font-medium text-gray-600">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data?.recentPayments.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="py-2 pr-4 font-medium">
                      {formatCurrency(p.amount)}
                    </td>
                    <td className="py-2 pr-4">{p.credits}</td>
                    <td className="py-2 pr-4 text-xs text-gray-500 font-mono">
                      {p.userId.length > 20
                        ? p.userId.slice(0, 20) + "…"
                        : p.userId}
                    </td>
                    <td className="py-2 text-sm text-gray-500">
                      {formatDate(p.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`p-4 rounded-lg shadow ${
        accent ? "bg-blue-50" : "bg-white"
      }`}
    >
      <p className="text-sm text-gray-500">{label}</p>
      <p
        className={`text-2xl font-bold mt-1 ${
          accent ? "text-blue-700" : ""
        }`}
      >
        {value}
      </p>
      <p className="text-xs text-gray-400 mt-1">{sub}</p>
    </div>
  );
}
