"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ProtectedRoute } from "@/app/components/ProtectedRoute";

import { useAdminDashboardStats } from "./_hooks/useAdminDashboardStats";

// Dynamically import chart component with SSR disabled
const ChartsClient = dynamic(() => import("./ChartsClient"), {
  ssr: false,
  loading: () => (
    <div className="space-y-3">
      <div className="p-3 md:p-4 bg-white rounded-lg shadow border space-y-3">
        <div className="h-4 bg-gray-200 rounded w-1/3" />
        <div className="h-56 bg-gray-100 rounded animate-pulse" />
      </div>
      <div className="p-3 md:p-4 bg-white rounded-lg shadow border space-y-3">
        <div className="h-4 bg-gray-200 rounded w-1/3" />
        <div className="h-56 bg-gray-100 rounded animate-pulse" />
      </div>
    </div>
  ),
});

export default function AdminDashboardPage() {
  return (
    <ProtectedRoute allowedRoles={["admin"]}>
      <AdminDashboardContent />
    </ProtectedRoute>
  );
}

function AdminDashboardContent() {
  const [activeWindowMinutes, setActiveWindowMinutes] = useState(60);
  const [jobWindowDays, setJobWindowDays] = useState(30);

  const {
    loading,
    error,
    activeUsersCount,
    jobsPostedCount,
    userDistributionData,
    jobStatusData,
  } = useAdminDashboardStats(activeWindowMinutes, jobWindowDays);

  const router = useRouter();

  return (
    // Admin dashboard is currently static UI scaffolding.
    // Next step: pull stats from Firestore (users/jobs/applications) + compute aggregates.

    <div className="p-4 md:p-6 space-y-6 md:space-y-8">
      {/* Header */}
      <h1 className="text-2xl md:text-3xl font-semibold">Admin Dashboard</h1>
      {/* // Admin dashboard is currently static UI scaffolding.
      // Next step: pull stats from Firestore (users/jobs/applications) + compute aggregates. */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Top stats (placeholders) */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-3 md:gap-4">
        <div className="p-3 md:p-4 bg-white rounded-lg shadow">
          <h2 className="text-sm md:text-base font-medium text-gray-700">
            Active Users
          </h2>
          <p className="text-2xl md:text-3xl font-bold mt-1 md:mt-2">
            {loading ? "-" : activeUsersCount}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Drivers + businesses online
          </p>
        </div>

        <div className="p-3 md:p-4 bg-white rounded-lg shadow">
          <h2 className="text-sm md:text-base font-medium text-gray-700">
            Jobs Posted ({jobWindowDays}d)
          </h2>
          <p className="text-2xl md:text-3xl font-bold mt-1 md:mt-2">
            {loading ? "-" : jobsPostedCount}
          </p>
          <p className="text-xs text-gray-500 mt-1">Last {jobWindowDays} days</p>
        </div>

        <div className="p-3 md:p-4 bg-white rounded-lg shadow">
          <h2 className="text-sm md:text-base font-medium text-gray-700">
            Revenue This Month
          </h2>
          <p className="text-2xl md:text-3xl font-bold mt-1 md:mt-2">R0.00</p>
          <p className="text-xs text-gray-500 mt-1">
            Platform fees + services
          </p>
        </div>

        <div className="p-3 md:p-4 bg-white rounded-lg shadow">
          <h2 className="text-sm md:text-base font-medium text-gray-700">
            Training Completion
          </h2>
          <p className="text-2xl md:text-3xl font-bold mt-1 md:mt-2">0%</p>
          <p className="text-xs text-gray-500 mt-1">
            Average across all users
          </p>
        </div>
      </section>

      {/* Admin actions (wire these to routes later) */}
      <section className="space-y-3 md:space-y-4">
        <h2 className="text-lg md:text-xl font-semibold">Quick Actions</h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 md:gap-4">
          <button
            onClick={() => router.push("/admin/active-users")}
            className="p-3 md:p-4 text-sm md:text-base bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700"
          >
            Manage Users
          </button>

          <button
            onClick={() => router.push("/admin/jobs-posted")}
            className="p-3 md:p-4 text-sm md:text-base bg-indigo-600 text-white rounded-lg shadow hover:bg-indigo-700"
          >
            Manage Jobs
          </button>

          <button
            onClick={() => router.push("/admin/revenue")}
            className="p-3 md:p-4 text-sm md:text-base bg-emerald-600 text-white rounded-lg shadow hover:bg-emerald-700"
          >
            View Revenue Reports
          </button>

          <button
            onClick={() => router.push("/admin/training")}
            className="p-3 md:p-4 text-sm md:text-base bg-amber-600 text-white rounded-lg shadow hover:bg-amber-700"
          >
            Training Analytics
          </button>
        </div>
      </section>

      {/* Main content */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        {/* AI assistant embed (mobile first) */}
        <aside className="order-1 md:order-2 p-3 md:p-4 bg-white rounded-lg shadow border flex flex-col">
          <h2 className="text-lg md:text-xl font-semibold mb-2">
            AI Admin Assistant
          </h2>
          <p className="text-xs md:text-sm text-gray-600 mb-3 md:mb-4">
            Ask about platform metrics, user issues, job trends, and training
            performance.
          </p>

          <div className="w-full h-64 md:h-80 lg:h-96 rounded-md overflow-hidden border">
            <iframe
              src="https://myagencycoach.agency/fe/alzB8glr?clsBtn=0"
              frameBorder="0"
              scrolling="yes"
              className="w-full h-full"
            />
          </div>
        </aside>

        {/* Charts + progress (placeholders) */}
        <div className="order-2 md:order-1 md:col-span-2 space-y-3 md:space-y-4">
          <h2 className="text-lg md:text-xl font-semibold">
            Platform Overview
          </h2>

          {/* User Distribution */}
          <label className="text-xs md:text-sm text-gray-700">Active window</label>
          <select
            className="border rounded-lg px-3 py-2 text-xs md:text-sm"
            value={activeWindowMinutes}
            onChange={(e) => setActiveWindowMinutes(Number(e.target.value))}
          >
            <option value={15}>Last 15 minutes</option>
            <option value={60}>Last 1 hour</option>
            <option value={60 * 24}>Last 24 hours</option>
            <option value={60 * 24 * 7}>Last 7 days</option>
          </select>

          {/* Charts - dynamically imported with SSR disabled */}
          <ChartsClient
            userDistributionData={userDistributionData}
            jobStatusData={jobStatusData}
          />

          {/* Training completion (simple bars for now) */}
          <div className="p-3 md:p-4 bg-white rounded-lg shadow border space-y-3">
            <div>
              <h3 className="font-medium text-sm md:text-base">
                Training Completion
              </h3>
              <p className="text-gray-600 mt-1 text-xs md:text-sm">
                Average completion across driver training and business onboarding.
              </p>
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="text-xs md:text-sm font-medium text-gray-700">
                  Driver Training
                </span>
                <span className="text-xs md:text-sm text-gray-600">55%</span>
              </div>
              <div className="w-full bg-blue-200 rounded h-2">
                <div className="bg-blue-600 h-2 rounded" style={{ width: "55%" }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-1 mt-2">
                <span className="text-xs md:text-sm font-medium text-gray-700">
                  Business Onboarding
                </span>
                <span className="text-xs md:text-sm text-gray-600">70%</span>
              </div>
              <div className="w-full bg-amber-200 rounded h-2">
                <div
                  className="bg-amber-500 h-2 rounded"
                  style={{ width: "70%" }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-1 mt-2">
                <span className="text-xs md:text-sm font-medium text-gray-700">
                  Overall Completion
                </span>
                <span className="text-xs md:text-sm text-gray-600">62%</span>
              </div>
              <div className="w-full bg-rose-200 rounded h-2">
                <div className="bg-rose-500 h-2 rounded" style={{ width: "62%" }} />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
