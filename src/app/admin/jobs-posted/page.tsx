"use client";

import { useMemo, useState, useEffect } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  query,
  orderBy,
  getDocs,
  deleteDoc,
} from "firebase/firestore";
import { app } from "@/lib/firebase";

type JobRow = {
  id: string;
  title?: string;
  businessName?: string;
  location?: string;
  vehicleType?: string;
  pay?: number | string;
  status?: string;
  computedStatus?: "open" | "closed" | "expired" | string;
  createdAt?: Date | null;
  expiry?: Date | null;
  isExpired?: boolean;
};

const formatDate = (d?: Date | null) => {
  if (!d) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    }).format(d);
  } catch {
    return d.toLocaleDateString();
  }
};

const chipBase =
  "inline-flex items-center rounded-full px-3 py-1 text-sm font-extrabold ring-1";

const statusChip = (status?: string) => {
  const s = String(status || "open").toLowerCase();

  if (s === "open")
    return "bg-emerald-100 text-emerald-900 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-100 dark:ring-emerald-900/60";

  if (s === "closed")
    return "bg-zinc-100 text-zinc-900 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700";

  if (s === "expired")
    return "bg-rose-100 text-rose-900 ring-rose-200 dark:bg-rose-950 dark:text-rose-100 dark:ring-rose-900/60";

  return "bg-amber-100 text-amber-900 ring-amber-200 dark:bg-amber-950 dark:text-amber-100 dark:ring-amber-900/60";
};

export default function JobsPostedPage() {
  const auth = useMemo(() => (app ? getAuth(app) : null), []);
  const db = useMemo(() => (app ? getFirestore(app) : null), []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const deleteJob = async (jobId: string) => {
    setError(null);

    if (!db) {
      setError("Firebase is not configured. Missing NEXT_PUBLIC_FIREBASE_* env vars.");
      return;
    }

    const ok = window.confirm("Delete this job? This cannot be undone.");
    if (!ok) return;

    setActingOn(jobId);

    try {
      await deleteDoc(doc(db, "jobs", jobId));
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
    } catch (e: any) {
      setError(e?.message || "Failed to delete job");
    } finally {
      setActingOn(null);
    }
  };

  // Verify admin
  useEffect(() => {
    setLoading(true);
    setError(null);
    setIsAdmin(false);

    if (!auth || !db) {
      setError("Firebase is not configured. Missing NEXT_PUBLIC_FIREBASE_* env vars.");
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setError("You must be logged in.");
        setLoading(false);
        return;
      }

      try {
        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);

        if (!snap.exists()) {
          setError("User profile not found.");
          setLoading(false);
          return;
        }

        const data = snap.data() as any;
        if (data.role === "admin") {
          setIsAdmin(true);
        } else {
          setError("Not authorized.");
        }
      } catch (e: any) {
        setError(e?.message || "Failed to verify admin.");
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [auth, db]);

  // Fetch jobs (admin only)
  useEffect(() => {
    if (!isAdmin) return;

    if (!db) {
      setError("Firebase is not configured. Missing NEXT_PUBLIC_FIREBASE_* env vars.");
      return;
    }

    const fetchJobs = async () => {
      setError(null);

      try {
        const jobsRef = collection(db, "jobs");
        const q = query(jobsRef, orderBy("createdAt", "desc"));
        const snap = await getDocs(q);

        const now = new Date();

        const list: JobRow[] = snap.docs
          .map((d) => {
            const data = d.data() as any;

            const expiry: Date | null =
              data.expiry?.toDate ? data.expiry.toDate() : null;

            const createdAt: Date | null =
              data.createdAt?.toDate ? data.createdAt.toDate() : null;

            const isExpired = !!expiry && expiry <= now;
            const computedStatus = isExpired ? "expired" : String(data.status || "open");

            return {
              id: d.id,
              title: data.title,
              businessName: data.businessName,
              location: data.location,
              vehicleType: data.vehicleType,
              pay: data.pay,
              status: data.status,
              createdAt,
              expiry,
              isExpired,
              computedStatus,
            };
          })
          // optional: keep non-expired first
          .sort((a, b) => (a.isExpired ? 1 : 0) - (b.isExpired ? 1 : 0));

        setJobs(list);
      } catch (e: any) {
        setError(e?.message || "Failed to load jobs.");
      }
    };

    fetchJobs();
  }, [isAdmin, db]);

  // UI states
  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-base text-zinc-700 dark:text-zinc-300">Loading…</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 shadow-sm dark:border-rose-900/50 dark:bg-rose-950/40">
            <p className="text-base font-semibold text-rose-700 dark:text-rose-200">
              {error}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-base font-semibold text-zinc-800 dark:text-zinc-200">
              Not authorized
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
              All Jobs
            </h1>
            <p className="text-base text-zinc-700 dark:text-zinc-300">
              Total jobs: <span className="font-semibold">{jobs.length}</span>
            </p>
          </div>
        </div>

        {/* Empty */}
        {jobs.length === 0 && (
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-base text-zinc-700 dark:text-zinc-300">
              No jobs found.
            </p>
          </div>
        )}

        {/* List (cards are mobile-first, become 2-column on large screens) */}
        {jobs.length > 0 && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
              >
                {/* Top row */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-lg font-extrabold break-words">
                      {job.title || "Untitled job"}
                    </div>
                    <div className="mt-1 text-base text-zinc-700 dark:text-zinc-300 break-words">
                      {job.businessName || "—"}
                    </div>
                  </div>

                  <div className={`${chipBase} ${statusChip(job.computedStatus)}`}>
                    {String(job.computedStatus || "open").toUpperCase()}
                  </div>
                </div>

                {/* Details */}
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
                    <div className="text-sm font-extrabold text-zinc-800 dark:text-zinc-200">
                      Location
                    </div>
                    <div className="mt-1 text-base text-zinc-700 dark:text-zinc-300 break-words">
                      {job.location || "—"}
                    </div>
                  </div>

                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
                    <div className="text-sm font-extrabold text-zinc-800 dark:text-zinc-200">
                      Vehicle
                    </div>
                    <div className="mt-1 text-base text-zinc-700 dark:text-zinc-300 break-words">
                      {job.vehicleType || "—"}
                    </div>
                  </div>

                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
                    <div className="text-sm font-extrabold text-zinc-800 dark:text-zinc-200">
                      Pay
                    </div>
                    <div className="mt-1 text-base text-zinc-700 dark:text-zinc-300">
                      {job.pay !== undefined && job.pay !== null ? `R${job.pay}` : "—"}
                    </div>
                  </div>

                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
                    <div className="text-sm font-extrabold text-zinc-800 dark:text-zinc-200">
                      Dates
                    </div>
                    <div className="mt-1 text-base text-zinc-700 dark:text-zinc-300">
                      Created: <span className="font-semibold">{formatDate(job.createdAt)}</span>
                    </div>
                    <div className="text-base text-zinc-700 dark:text-zinc-300">
                      Expires: <span className="font-semibold">{formatDate(job.expiry)}</span>
                    </div>
                  </div>
                </div>

                {/* Footer actions */}
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                  <button
                    onClick={() => deleteJob(job.id)}
                    disabled={actingOn === job.id}
                    className="h-12 rounded-xl bg-rose-700 px-4 text-base font-extrabold text-white shadow-sm transition hover:bg-rose-800 focus:outline-none focus:ring-4 focus:ring-rose-200 disabled:opacity-60 disabled:hover:bg-rose-700 dark:focus:ring-rose-900/40"
                  >
                    {actingOn === job.id ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}