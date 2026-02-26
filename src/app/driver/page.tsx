"use client";

import { useRouter } from "next/navigation";
import {
  Briefcase,
  Wallet,
  GraduationCap,
  ArrowRight,
  UploadCloud,
  PlayCircle,
} from "lucide-react";

const BRAND = {
  orange: "#F36C21",
  red: "#E02020",
  dark: "#0B1220",
};

export default function DriverDashboardPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 md:px-8">
      <div className="max-w-6xl mx-auto space-y-10">
        {/* Header */}
        <header className="space-y-2">
          <h1 className="text-3xl md:text-4xl font-semibold text-gray-900">
            Driver Dashboard
          </h1>
          <p className="text-sm md:text-base text-gray-600">
            Track your work, earnings, and training progress at a glance
          </p>
        </header>

        {/* Stats */}
        <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          <StatCard icon={<Briefcase />} label="Completed Jobs" value="0" />
          <StatCard icon={<Wallet />} label="Total Earnings" value="R0.00" />
          <StatCard
            icon={<GraduationCap />}
            label="Training Progress"
            value="0%"
          />
        </section>

        {/* Quick actions */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Quick Actions</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <ActionCard
              title="View Available Jobs"
              description="Browse and apply for new delivery jobs"
              onClick={() => router.push("/driver/jobs")}
              color={BRAND.orange}
              icon={<ArrowRight />}
            />

            <ActionCard
              title="Upload Documents"
              description="Verify your account to unlock more jobs"
              onClick={() => router.push("/driver/documents")}
              color={BRAND.red}
              icon={<UploadCloud />}
            />
          </div>
        </section>

        {/* Main content */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Training modules */}
          <div className="lg:col-span-2 space-y-5">
            <h2 className="text-lg font-semibold text-gray-900">
              Training Modules
            </h2>

            {[
              {
                title: "Module 1: Safety Basics",
                desc: "Essential road safety rules and awareness.",
                progress: 70,
              },
              {
                title: "Module 2: Vehicle Preparation",
                desc: "Daily checks and professional readiness.",
                progress: 40,
              },
              {
                title: "Module 3: Customer Service",
                desc: "Communication and professionalism.",
                progress: 10,
              },
            ].map((m) => (
              <div
                key={m.title}
                className="rounded-3xl bg-white border p-6 shadow-sm space-y-4">
                <div>
                  <h3 className="text-base md:text-lg font-semibold text-gray-900">
                    {m.title}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">{m.desc}</p>
                </div>

                <div className="flex items-center justify-between">
                  <button
                    onClick={() => router.push("/driver/training")}
                    className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition"
                    style={{ backgroundColor: BRAND.orange }}>
                    <PlayCircle size={16} />
                    Continue
                  </button>

                  <span className="text-sm font-medium text-gray-700">
                    {m.progress}%
                  </span>
                </div>

                <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${m.progress}%`,
                      backgroundColor: BRAND.orange,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* AI Coach */}
          <aside className="rounded-3xl bg-white border p-6 shadow-sm flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                AI Training Coach
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Ask questions about jobs, routes, documents, and training.
              </p>
            </div>

            <div className="flex-1 rounded-2xl overflow-hidden border">
              <iframe
                src="https://myagencycoach.agency/fe/alzB8glr?clsBtn=0"
                className="w-full h-full"
                frameBorder="0"
                scrolling="yes"
              />
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}

/* ---------------- Components ---------------- */

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-3xl bg-white border p-6 shadow-sm flex items-center gap-4">
      <div
        className="h-12 w-12 rounded-2xl flex items-center justify-center text-white"
        style={{ backgroundColor: BRAND.orange }}>
        {icon}
      </div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-2xl font-semibold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

function ActionCard({
  title,
  description,
  onClick,
  color,
  icon,
}: {
  title: string;
  description: string;
  onClick: () => void;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-3xl bg-white border p-6 shadow-sm text-left hover:shadow-md transition flex items-center justify-between gap-4">
      <div>
        <p className="text-base font-semibold text-gray-900">{title}</p>
        <p className="text-sm text-gray-600 mt-1">{description}</p>
      </div>

      <div
        className="h-10 w-10 rounded-xl flex items-center justify-center text-white shrink-0"
        style={{ backgroundColor: color }}>
        {icon}
      </div>
    </button>
  );
}
