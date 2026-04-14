"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Award,
  BarChart3,
  CheckCircle2,
  Clock,
  Filter,
  Search,
  X,
} from "lucide-react";

import { app } from "@/lib/firebase";
import { getFirestore, collection, getDocs, query, where } from "firebase/firestore";

/**
 * Admin Training Dashboard
 * - Reads /users where role == "driver"
 * - Uses trainingProgress.{moduleId}.quiz.attempts[] + lastScore + passed + lastAttemptAt
 * - Shows per-driver completion %, pass attempts, last score, last activity
 *
 * NOTE: Your Firestore rules already allow admins to list users, so this works
 * as long as the logged-in admin has users/{uid}.role == "admin".
 */

type ModuleStatus = "not_started" | "in_progress" | "completed";

type Attempt = {
  scorePct?: number;
  correctCount?: number;
  total?: number;
  passed?: boolean;
  submittedAt?: any; // Timestamp
};

type TrainingModuleProgress = {
  status?: ModuleStatus;
  quiz?: {
    lastScore?: number;
    passed?: boolean;
    lastAttemptAt?: any; // Timestamp
    attempts?: Attempt[];
  };
};

type UserDoc = {
  email?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  role?: "driver" | "business" | "admin" | null;

  trainingProgress?: Record<string, TrainingModuleProgress>;

  lastTrainingUpdatedAt?: any; // Timestamp
  lastLoginAt?: any; // Timestamp
  createdAt?: any; // Timestamp
  updatedAt?: any; // Timestamp
};

type DriverRow = {
  id: string;
  email: string;
  displayName: string;
  phone?: string;

  // computed
  completionPct: number;
  modulesCompleted: number;
  modulesTotal: number;

  quizzesPassed: number;
  quizzesFailed: number;
  totalAttempts: number;

  lastScore?: number;
  lastAttemptAt?: Date | null;
  lastActivityAt?: Date | null; // lastTrainingUpdatedAt or lastAttemptAt
};

type SortKey =
  | "name"
  | "completion"
  | "attempts"
  | "passed"
  | "failed"
  | "lastActivity";

const BRAND = {
  orange: "#F36C21",
};

const FALLBACK_MODULES = [
  "m1",
  "m2",
  "m3",
  "m4",
  "m5",
  "m6",
  "m7",
  "m8",
  "m9",
  "m10",
  "m11",
  "m12",
];

// Firestore Timestamp -> Date
function toDateSafe(ts: any): Date | null {
  if (!ts) return null;
  try {
    if (typeof ts?.toDate === "function") return ts.toDate();
    // If you ever stored Date directly
    if (ts instanceof Date) return ts;
    return null;
  } catch {
    return null;
  }
}

function formatDT(d?: Date | null) {
  if (!d) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

function computeDriverRow(uid: string, u: UserDoc, moduleIds: string[]): DriverRow {
  const email = u.email ?? "—";
  const displayName =
    u.name?.trim() ||
    `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() ||
    email;

  const tp = u.trainingProgress ?? {};

  let modulesCompleted = 0;
  let quizzesPassed = 0;
  let quizzesFailed = 0;
  let totalAttempts = 0;

  let lastScore: number | undefined = undefined;
  let lastAttemptAt: Date | null = null;

  for (const mid of moduleIds) {
    const mp = tp[mid];
    if (mp?.status === "completed") modulesCompleted++;

    const quiz = mp?.quiz;
    if (!quiz) continue;

    // attempts
    const attempts = Array.isArray(quiz.attempts) ? quiz.attempts : [];
    totalAttempts += attempts.length;

    for (const a of attempts) {
      if (a?.passed === true) quizzesPassed++;
      if (a?.passed === false) quizzesFailed++;
    }

    // lastScore (take latest "lastScore" by lastAttemptAt if available)
    const thisAttemptAt = toDateSafe(quiz.lastAttemptAt);
    if (typeof quiz.lastScore === "number") {
      if (!lastAttemptAt && thisAttemptAt) {
        lastScore = quiz.lastScore;
        lastAttemptAt = thisAttemptAt;
      } else if (thisAttemptAt && lastAttemptAt && thisAttemptAt > lastAttemptAt) {
        lastScore = quiz.lastScore;
        lastAttemptAt = thisAttemptAt;
      } else if (!thisAttemptAt && lastScore == null) {
        lastScore = quiz.lastScore;
      }
    } else {
      // fallback: infer from last attempt
      if (attempts.length > 0) {
        const last = attempts[attempts.length - 1];
        const lastSub = toDateSafe(last.submittedAt);
        if (typeof last.scorePct === "number") {
          if (!lastAttemptAt && lastSub) {
            lastScore = last.scorePct;
            lastAttemptAt = lastSub;
          } else if (lastSub && lastAttemptAt && lastSub > lastAttemptAt) {
            lastScore = last.scorePct;
            lastAttemptAt = lastSub;
          }
        }
      }
    }
  }

  const modulesTotal = moduleIds.length;
  const completionPct = modulesTotal
    ? clamp(Math.round((modulesCompleted / modulesTotal) * 100))
    : 0;

  const lastTrainingUpdatedAt = toDateSafe(u.lastTrainingUpdatedAt);
  const lastActivityAt =
    (lastTrainingUpdatedAt && lastAttemptAt
      ? new Date(Math.max(lastTrainingUpdatedAt.getTime(), lastAttemptAt.getTime()))
      : lastTrainingUpdatedAt || lastAttemptAt) ?? null;

  return {
    id: uid,
    email,
    displayName,
    phone: u.phone,
    completionPct,
    modulesCompleted,
    modulesTotal,
    quizzesPassed,
    quizzesFailed,
    totalAttempts,
    lastScore,
    lastAttemptAt,
    lastActivityAt,
  };
}

export default function TrainingPageClient() {
  const db = useMemo(() => getFirestore(app), []);

  const moduleIds = useMemo(() => FALLBACK_MODULES, []);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<DriverRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [qText, setQText] = useState("");
  const [minCompletion, setMinCompletion] = useState<number>(0);
  const [onlyBehind, setOnlyBehind] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("lastActivity");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(() => rows.find((r) => r.id === selectedId) ?? null, [rows, selectedId]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const usersRef = collection(db, "users");
        // drivers only
        const q = query(usersRef, where("role", "==", "driver"));
        const snap = await getDocs(q);

        if (!mounted) return;

        const next: DriverRow[] = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data() as UserDoc;
          next.push(computeDriverRow(docSnap.id, data, moduleIds));
        });

        setRows(next);
      } catch (e: any) {
        console.error("Admin dashboard load failed:", e);
        setError(e?.message ?? "Failed to load drivers.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [db, moduleIds]);

  const totals = useMemo(() => {
    const drivers = rows.length;
    const avgCompletion =
      drivers > 0 ? Math.round(rows.reduce((a, r) => a + r.completionPct, 0) / drivers) : 0;
    const totalAttempts = rows.reduce((a, r) => a + r.totalAttempts, 0);
    const passed = rows.reduce((a, r) => a + r.quizzesPassed, 0);
    const failed = rows.reduce((a, r) => a + r.quizzesFailed, 0);
    const fullyCertified = rows.filter((r) => r.completionPct === 100).length;

    return { drivers, avgCompletion, totalAttempts, passed, failed, fullyCertified };
  }, [rows]);

  const filtered = useMemo(() => {
    const t = qText.trim().toLowerCase();

    let list = rows.filter((r) => {
      const matchesText =
        !t ||
        r.displayName.toLowerCase().includes(t) ||
        r.email.toLowerCase().includes(t) ||
        (r.phone ?? "").toLowerCase().includes(t);

      const matchesCompletion = r.completionPct >= minCompletion;

      // "Behind" heuristic: has attempts but completion is low, or failed attempts dominate
      const behind =
        r.completionPct < 50 ||
        (r.totalAttempts >= 2 && r.quizzesFailed > r.quizzesPassed) ||
        (typeof r.lastScore === "number" && r.lastScore < 80);

      return matchesText && matchesCompletion && (!onlyBehind || behind);
    });

    const dir = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      const cmp = (x: number | string, y: number | string) =>
        x < y ? -1 : x > y ? 1 : 0;

      if (sortKey === "name") return cmp(a.displayName.toLowerCase(), b.displayName.toLowerCase()) * dir;
      if (sortKey === "completion") return (a.completionPct - b.completionPct) * dir;
      if (sortKey === "attempts") return (a.totalAttempts - b.totalAttempts) * dir;
      if (sortKey === "passed") return (a.quizzesPassed - b.quizzesPassed) * dir;
      if (sortKey === "failed") return (a.quizzesFailed - b.quizzesFailed) * dir;

      // lastActivity
      const at = a.lastActivityAt?.getTime() ?? 0;
      const bt = b.lastActivityAt?.getTime() ?? 0;
      return (at - bt) * dir;
    });

    return list;
  }, [rows, qText, minCompletion, onlyBehind, sortKey, sortDir]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b bg-white">
        <div className="max-w-7xl mx-auto px-4 py-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold text-gray-900">
              Admin Training Dashboard
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              View driver progress, quiz attempts, pass rates, and activity.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-2xl border bg-white px-4 py-3 shadow-sm min-w-[220px]">
              <p className="text-xs text-gray-500">Drivers</p>
              <p className="text-lg font-semibold text-gray-900">{totals.drivers}</p>
            </div>

            <div className="rounded-2xl border bg-white px-4 py-3 shadow-sm min-w-[220px]">
              <p className="text-xs text-gray-500">Avg completion</p>
              <p className="text-lg font-semibold text-gray-900">{totals.avgCompletion}%</p>
              <div className="mt-2 h-2 w-full rounded-full bg-gray-200 overflow-hidden">
                <div
                  className="h-2 rounded-full"
                  style={{ width: `${totals.avgCompletion}%`, backgroundColor: BRAND.orange }}
                />
              </div>
            </div>

            <div className="rounded-2xl border bg-white px-4 py-3 shadow-sm min-w-[220px]">
              <p className="text-xs text-gray-500">Attempts / Passed / Failed</p>
              <p className="text-lg font-semibold text-gray-900">
                {totals.totalAttempts} / {totals.passed} / {totals.failed}
              </p>
            </div>

            <div className="rounded-2xl border bg-orange-50 px-4 py-3 shadow-sm min-w-[220px] flex items-center gap-2">
              <Award className="text-orange-600" />
              <div>
                <p className="text-xs text-gray-600">Certified drivers</p>
                <p className="font-semibold text-gray-900">{totals.fullyCertified}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="rounded-2xl border bg-white shadow-sm p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex-1 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  value={qText}
                  onChange={(e) => setQText(e.target.value)}
                  placeholder="Search drivers by name, email, phone..."
                  className="w-full pl-10 pr-3 py-2 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-orange-200"
                />
              </div>

              <div className="hidden md:flex items-center gap-2 text-sm text-gray-600">
                <Filter size={18} />
                <span>Filters</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs text-gray-600">Min completion</label>
              <select
                value={minCompletion}
                onChange={(e) => setMinCompletion(Number(e.target.value))}
                className="px-3 py-2 rounded-xl border text-sm bg-white"
              >
                <option value={0}>0%</option>
                <option value={25}>25%</option>
                <option value={50}>50%</option>
                <option value={75}>75%</option>
                <option value={100}>100%</option>
              </select>

              <label className="inline-flex items-center gap-2 text-sm text-gray-700 px-3 py-2 rounded-xl border bg-white">
                <input
                  type="checkbox"
                  checked={onlyBehind}
                  onChange={(e) => setOnlyBehind(e.target.checked)}
                />
                Show "behind"
              </label>

              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="px-3 py-2 rounded-xl border text-sm bg-white"
              >
                <option value="lastActivity">Sort: Last activity</option>
                <option value="completion">Sort: Completion</option>
                <option value="attempts">Sort: Attempts</option>
                <option value="passed">Sort: Passed</option>
                <option value="failed">Sort: Failed</option>
                <option value="name">Sort: Name</option>
              </select>

              <button
                onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                className="px-3 py-2 rounded-xl border text-sm bg-white hover:bg-gray-50"
              >
                {sortDir === "asc" ? "Asc" : "Desc"}
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Table */}
        <div className="mt-6 rounded-2xl border bg-white shadow-sm overflow-hidden">
          <div className="p-4 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="text-orange-600" />
              <h2 className="text-lg font-semibold text-gray-900">Drivers</h2>
              <span className="text-sm text-gray-500">({filtered.length})</span>
            </div>

            {loading && (
              <div className="text-sm text-gray-500 flex items-center gap-2">
                <Clock size={16} /> Loading...
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Driver</th>
                  <th className="text-left px-4 py-3 font-semibold">Completion</th>
                  <th className="text-left px-4 py-3 font-semibold">Attempts</th>
                  <th className="text-left px-4 py-3 font-semibold">Passed</th>
                  <th className="text-left px-4 py-3 font-semibold">Failed</th>
                  <th className="text-left px-4 py-3 font-semibold">Last score</th>
                  <th className="text-left px-4 py-3 font-semibold">Last activity</th>
                  <th className="text-right px-4 py-3 font-semibold">Action</th>
                </tr>
              </thead>

              <tbody className="divide-y">
                {filtered.map((r) => {
                  const behind =
                    r.completionPct < 50 ||
                    (r.totalAttempts >= 2 && r.quizzesFailed > r.quizzesPassed) ||
                    (typeof r.lastScore === "number" && r.lastScore < 80);

                  return (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900">{r.displayName}</div>
                        <div className="text-xs text-gray-500">{r.email}{r.phone ? ` • ${r.phone}` : ""}</div>
                        {behind && (
                          <div className="mt-1 inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full bg-red-100 text-red-700">
                            Needs attention
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900">
                          {r.completionPct}%{" "}
                          <span className="text-xs text-gray-500">
                            ({r.modulesCompleted}/{r.modulesTotal})
                          </span>
                        </div>
                        <div className="mt-2 h-2 w-[180px] rounded-full bg-gray-200 overflow-hidden">
                          <div
                            className="h-2 rounded-full"
                            style={{ width: `${r.completionPct}%`, backgroundColor: BRAND.orange }}
                          />
                        </div>
                      </td>

                      <td className="px-4 py-3 font-semibold text-gray-900">{r.totalAttempts}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900">{r.quizzesPassed}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900">{r.quizzesFailed}</td>

                      <td className="px-4 py-3">
                        {typeof r.lastScore === "number" ? (
                          <span
                            className={[
                              "inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full",
                              r.lastScore >= 80 ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700",
                            ].join(" ")}
                          >
                            <CheckCircle2 size={14} />
                            {r.lastScore}%
                          </span>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-gray-700">{formatDT(r.lastActivityAt)}</td>

                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setSelectedId(r.id)}
                          className="px-3 py-2 rounded-xl border text-sm font-semibold hover:bg-gray-50"
                        >
                          View details
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {!loading && filtered.length === 0 && (
                  <tr>
                    <td className="px-4 py-10 text-center text-gray-500" colSpan={8}>
                      No drivers match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Details Drawer */}
        {selected && (
          <div className="fixed inset-0 z-50">
            <div
              className="absolute inset-0 bg-black/30"
              onClick={() => setSelectedId(null)}
            />
            <div className="absolute right-0 top-0 h-full w-full max-w-xl bg-white shadow-xl border-l">
              <div className="p-4 border-b flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{selected.displayName}</h3>
                  <p className="text-sm text-gray-600">{selected.email}</p>
                  <p className="text-xs text-gray-500 mt-1">Driver ID: {selected.id}</p>
                </div>
                <button
                  onClick={() => setSelectedId(null)}
                  className="p-2 rounded-xl border hover:bg-gray-50"
                  aria-label="Close"
                >
                  <X />
                </button>
              </div>

              <div className="p-4 space-y-4 overflow-auto h-[calc(100%-64px)]">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border p-4">
                    <p className="text-xs text-gray-500">Completion</p>
                    <p className="text-xl font-semibold text-gray-900">
                      {selected.completionPct}%
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {selected.modulesCompleted}/{selected.modulesTotal} modules completed
                    </p>
                  </div>

                  <div className="rounded-2xl border p-4">
                    <p className="text-xs text-gray-500">Attempts</p>
                    <p className="text-xl font-semibold text-gray-900">{selected.totalAttempts}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Passed {selected.quizzesPassed} • Failed {selected.quizzesFailed}
                    </p>
                  </div>

                  <div className="rounded-2xl border p-4">
                    <p className="text-xs text-gray-500">Last score</p>
                    <p className="text-xl font-semibold text-gray-900">
                      {typeof selected.lastScore === "number" ? `${selected.lastScore}%` : "—"}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Last attempt: {formatDT(selected.lastAttemptAt)}
                    </p>
                  </div>

                  <div className="rounded-2xl border p-4">
                    <p className="text-xs text-gray-500">Last activity</p>
                    <p className="text-xl font-semibold text-gray-900">
                      {selected.lastActivityAt ? "Active" : "—"}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {formatDT(selected.lastActivityAt)}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border p-4">
                  <h4 className="text-sm font-semibold text-gray-900">What this admin view covers</h4>
                  <p className="text-sm text-gray-600 mt-1">
                    This dashboard reads each driver&apos;s <code className="px-1 rounded bg-gray-100">trainingProgress</code>{" "}
                    and aggregates attempts, pass/fail counts, completion, and last activity. If you want per-module
                    attempt history (every attempt list), we&apos;ll add a "Module drill-down" next.
                  </p>
                </div>

                <div className="rounded-2xl border p-4 bg-orange-50 border-orange-200">
                  <p className="text-sm font-semibold text-gray-900">Next improvement (optional)</p>
                  <p className="text-sm text-gray-700 mt-1">
                    If you want to see <b>attempts per module</b> (e.g. m1 attempts: 3 tries, scores 40/60/85),
                    tell me and I&apos;ll add a clean module grid here with the full attempts list pulled from Firestore.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
