"use client";

import { useRouter } from "next/navigation";
import {
  Briefcase,
  ClipboardList,
  Users,
  TrendingUp,
  Sparkles,
  ArrowRight,
} from "lucide-react";

const BRAND = {
  orange: "#F36C21",
  red: "#E02020",
  dark: "#0B1220",
};

export default function BusinessDashboardPage() {
  const router = useRouter();

  // NOTE:
  // Mobile-first spacing assumes your app has:
  // - Mobile top bar (h-14) and bottom tabs (h-16-ish)
  // So we pad: pt-14 pb-20 on mobile, and remove on md+.
  return (
    <div className="min-h-screen bg-gray-50 pt-14 pb-20 md:pt-6 md:pb-6">
      <div className="px-4 md:px-6 max-w-6xl mx-auto space-y-6 md:space-y-8">
        {/* Header */}
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1 text-xs font-semibold text-gray-700">
              <Sparkles className="h-4 w-4" style={{ color: BRAND.orange }} />
              Business Portal
            </div>

            <h1
              className="text-2xl md:text-3xl font-semibold text-gray-900 dark:text-slate-100
">
              Business Dashboard
            </h1>

            <p className="text-sm text-gray-600 max-w-xl">
              Post jobs, review applications, and track performance at a glance.
            </p>
          </div>

          <button
            onClick={() => router.push("/business/post-job")}
            className="hidden md:inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition active:scale-[0.99]"
            style={{ backgroundColor: BRAND.orange }}>
            Post a Job
            <ArrowRight className="h-4 w-4" />
          </button>
        </header>

        {/* Top stats */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
          <StatCard
            title="Open Jobs"
            value="0"
            icon={<Briefcase className="h-5 w-5" />}
            accent={BRAND.orange}
            helper="Jobs currently accepting applications."
          />
          <StatCard
            title="Applications to Review"
            value="0"
            icon={<Users className="h-5 w-5" />}
            accent={BRAND.red}
            helper="New applications needing a decision."
          />
          <StatCard
            title="Spent This Month"
            value="R0.00"
            icon={<TrendingUp className="h-5 w-5" />}
            accent={BRAND.dark}
            helper="Total platform spend this month."
          />
        </section>

        {/* Mobile quick actions */}
        <section className="md:hidden">
          <h2
            className="text-base font-semibold text-gray-900 dark:text-slate-100
 mb-3">
            Quick Actions
          </h2>

          <div className="grid grid-cols-1 gap-3">
            <ActionRow
              title="Post a Job"
              desc="Create a new job listing in minutes."
              onClick={() => router.push("/business/post-job")}
              accent={BRAND.orange}
            />
            <ActionRow
              title="View Active Jobs"
              desc="See jobs you’ve posted and their status."
              onClick={() => router.push("/business/posted-jobs")}
              accent={BRAND.dark}
            />
            <ActionRow
              title="Review Applications"
              desc="Browse drivers and shortlist quickly."
              onClick={() => router.push("/business/applicants")}
              accent={BRAND.red}
            />
          </div>
        </section>

        {/* Desktop quick actions */}
        <section className="hidden md:block space-y-4">
          <h2
            className="text-lg font-semibold text-gray-900 dark:text-slate-100
">
            Quick Actions
          </h2>

          <div className="grid grid-cols-3 gap-4">
            <button
              onClick={() => router.push("/business/post-job")}
              className="group rounded-2xl border bg-white p-4 text-left shadow-sm hover:shadow-md transition">
              <div className="flex items-center justify-between">
                <div
                  className="h-11 w-11 rounded-2xl grid place-items-center border"
                  style={{
                    backgroundColor: "#FFF7ED",
                    borderColor: "#FED7AA",
                    color: BRAND.orange,
                  }}>
                  <Briefcase className="h-5 w-5" />
                </div>
                <ArrowRight className="h-4 w-4 text-gray-300 group-hover:text-gray-500 transition" />
              </div>
              <div
                className="mt-3 font-semibold text-gray-900 dark:text-slate-100
">
                Post a Job
              </div>
              <div className="text-sm text-gray-600 mt-1">
                Create a new job listing.
              </div>
            </button>

            <button
              onClick={() => router.push("/business/posted-jobs")}
              className="group rounded-2xl border bg-white p-4 text-left shadow-sm hover:shadow-md transition">
              <div className="flex items-center justify-between">
                <div
                  className="h-11 w-11 rounded-2xl grid place-items-center border"
                  style={{
                    backgroundColor: "#F8FAFC",
                    borderColor: "#E5E7EB",
                    color: BRAND.dark,
                  }}>
                  <ClipboardList className="h-5 w-5" />
                </div>
                <ArrowRight className="h-4 w-4 text-gray-300 group-hover:text-gray-500 transition" />
              </div>
              <div
                className="mt-3 font-semibold text-gray-900 dark:text-slate-100
">
                View Active Jobs
              </div>
              <div className="text-sm text-gray-600 mt-1">
                Track posted jobs and expiry.
              </div>
            </button>

            <button
              onClick={() => router.push("/business/applicants")}
              className="group rounded-2xl border bg-white p-4 text-left shadow-sm hover:shadow-md transition">
              <div className="flex items-center justify-between">
                <div
                  className="h-11 w-11 rounded-2xl grid place-items-center border"
                  style={{
                    backgroundColor: "#FFF1F2",
                    borderColor: "#FECDD3",
                    color: BRAND.red,
                  }}>
                  <Users className="h-5 w-5" />
                </div>
                <ArrowRight className="h-4 w-4 text-gray-300 group-hover:text-gray-500 transition" />
              </div>
              <div
                className="mt-3 font-semibold text-gray-900 dark:text-slate-100
">
                Review Applications
              </div>
              <div className="text-sm text-gray-600 mt-1">
                Shortlist and message drivers.
              </div>
            </button>
          </div>
        </section>

        {/* Main area:
            Mobile order is coach first. Desktop is performance first. */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
          {/* AI Coach */}
          <aside className="order-1 md:order-2 rounded-2xl border bg-white shadow-sm overflow-hidden">
            <div className="p-4 border-b bg-gradient-to-r from-orange-50 to-white">
              <h2
                className="text-lg font-semibold text-gray-900 dark:text-slate-100
">
                AI Business Coach
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Ask about job posts, driver matching, pricing and platform
                features.
              </p>
            </div>

            <div className="p-3">
              <div className="w-full h-72 md:h-[22rem] lg:h-[26rem] rounded-xl overflow-hidden border">
                <iframe
                  src="https://myagencycoach.agency/fe/alzB8glr?clsBtn=0"
                  frameBorder="0"
                  scrolling="yes"
                  className="w-full h-full"
                />
              </div>
            </div>
          </aside>

          {/* Performance overview */}
          <div className="order-2 md:order-1 md:col-span-2 space-y-3 md:space-y-4">
            <SectionTitle
              title="Performance Overview"
              subtitle="These are placeholder metrics until Firestore is connected."
            />

            <MetricCard
              title="Job Fulfillment Rate"
              desc="Percentage of posted jobs that get matched with a driver."
              valueLabel="Fulfilled"
              value="80%"
              percent={80}
              tone="orange"
            />

            <MetricCard
              title="Application Quality"
              desc="How well incoming applications match your requirements."
              valueLabel="Quality Score"
              value="65%"
              percent={65}
              tone="dark"
            />

            <MetricCard
              title="Job Completion Success"
              desc="Jobs completed without cancellations or disputes."
              valueLabel="Success Rate"
              value="92%"
              percent={92}
              tone="red"
            />
          </div>
        </section>
      </div>
    </div>
  );
}

/* ---------- Small UI Components ---------- */

function StatCard(props: {
  title: string;
  value: string;
  helper: string;
  icon: React.ReactNode;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p
            className="text-sm font-semibold text-gray-900 dark:text-slate-100
">
            {props.title}
          </p>
          <p
            className="text-3xl font-bold text-gray-900 dark:text-slate-100
 mt-2">
            {props.value}
          </p>
          <p className="text-xs text-gray-500 mt-2">{props.helper}</p>
        </div>

        <div
          className="h-11 w-11 rounded-2xl grid place-items-center border"
          style={{
            backgroundColor:
              props.accent === BRAND.dark ? "#F8FAFC" : "#FFF7ED",
            borderColor: props.accent === BRAND.dark ? "#E5E7EB" : "#FED7AA",
            color: props.accent,
          }}>
          {props.icon}
        </div>
      </div>
    </div>
  );
}

function ActionRow(props: {
  title: string;
  desc: string;
  onClick: () => void;
  accent: string;
}) {
  return (
    <button
      onClick={props.onClick}
      className="rounded-2xl border bg-white p-4 shadow-sm active:scale-[0.99] transition text-left">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div
            className="text-sm font-semibold text-gray-900 dark:text-slate-100
">
            {props.title}
          </div>
          <div className="text-xs text-gray-600 mt-1">{props.desc}</div>
        </div>

        <div
          className="h-10 w-10 rounded-2xl grid place-items-center border"
          style={{
            backgroundColor:
              props.accent === BRAND.red
                ? "#FFF1F2"
                : props.accent === BRAND.dark
                  ? "#F8FAFC"
                  : "#FFF7ED",
            borderColor:
              props.accent === BRAND.red
                ? "#FECDD3"
                : props.accent === BRAND.dark
                  ? "#E5E7EB"
                  : "#FED7AA",
            color: props.accent,
          }}>
          <ArrowRight className="h-4 w-4" />
        </div>
      </div>
    </button>
  );
}

function SectionTitle(props: { title: string; subtitle: string }) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div
        className="text-sm font-semibold text-gray-900 dark:text-slate-100
">
        {props.title}
      </div>
      <div className="text-xs text-gray-600 mt-1">{props.subtitle}</div>
    </div>
  );
}

function MetricCard(props: {
  title: string;
  desc: string;
  valueLabel: string;
  value: string;
  percent: number;
  tone: "orange" | "red" | "dark";
}) {
  const bar =
    props.tone === "orange"
      ? { track: "bg-orange-100", fill: "bg-orange-500" }
      : props.tone === "red"
        ? { track: "bg-rose-100", fill: "bg-rose-500" }
        : { track: "bg-slate-200", fill: "bg-slate-900" };

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm space-y-3">
      <div>
        <h3
          className="text-sm font-semibold text-gray-900 dark:text-slate-100
">
          {props.title}
        </h3>
        <p className="text-xs text-gray-600 mt-1">{props.desc}</p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-gray-700">
            {props.valueLabel}
          </span>
          <span className="text-xs text-gray-600">{props.value}</span>
        </div>

        <div className={`w-full h-2 rounded-full ${bar.track}`}>
          <div
            className={`h-2 rounded-full ${bar.fill}`}
            style={{ width: `${Math.min(100, Math.max(0, props.percent))}%` }}
          />
        </div>
      </div>
    </div>
  );
}
