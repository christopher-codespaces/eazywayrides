"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  doc,
  getDoc,
  updateDoc,
} from "firebase/firestore";
import {
  ArrowLeft,
  Briefcase,
  MapPin,
  CarFront,
  Banknote,
  Users,
  Calendar,
  Loader2,
  Sparkles,
} from "lucide-react";
import { app } from "@/lib/firebase";
import dynamic from "next/dynamic";

type Job = {
  id: string;
  title: string;
  description?: string;
  location: string;
  vehicleType: string;
  pay: number;

  status: string;
  createdAt?: Date | null;
  expiry?: Date | null;

  computedStatus?: "open" | "closed" | "expired";
  isExpired?: boolean;
};

const BRAND = {
  orange: "#F36C21",
  orangeSoft: "#FFF3EC",
  orangeSoft2: "#FFE6D6",
  dark: "#0B1220",
  ring: "rgba(243,108,33,0.22)",
};

const formatDate = (date: Date | null | undefined) => {
  if (!date) return "—";
  return date.toLocaleDateString();
};

const StatusBadge = ({ status }: { status?: Job["computedStatus"] }) => {
  const s = status || "closed";
  const base =
    "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold";

  if (s === "open") {
    return (
      <span className={`${base} bg-white text-emerald-700 border-emerald-200`}>
        OPEN
      </span>
    );
  }
  if (s === "expired") {
    return (
      <span className={`${base} bg-white text-rose-700 border-rose-200`}>
        EXPIRED
      </span>
    );
  }
  return (
    <span
      className={`${base} bg-white`}
      style={{ color: BRAND.orange, borderColor: BRAND.orangeSoft2 }}>
      CLOSED
    </span>
  );
};

function PostedJobsPageContent() {
  const auth = useMemo(() => (app ? getAuth(app) : null), []);
  const db = useMemo(() => (app ? getFirestore(app) : null), []);
  const router = useRouter();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const toggleJobStatus = async (job: Job) => {
    setError(null);

    if (!db) {
      setError("Database not initialized.");
      return;
    }

    if (job.isExpired) {
      setError("This job is expired and cannot be reopened.");
      return;
    }
    if (togglingId === job.id) return;

    const newStatus = job.status === "open" ? "closed" : "open";

    // optimistic
    setTogglingId(job.id);
    setJobs((prev) =>
      prev.map((j) =>
        j.id === job.id
          ? { ...j, status: newStatus, computedStatus: newStatus }
          : j,
      ),
    );

    try {
      if (!db) {
        setError("Database not initialized");
        return;
      }
      await updateDoc(doc(db, "jobs", job.id), { status: newStatus });
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to update job status.");

      // rollback
      setJobs((prev) =>
        prev.map((j) =>
          j.id === job.id
            ? { ...j, status: job.status, computedStatus: job.computedStatus }
            : j,
        ),
      );
    } finally {
      setTogglingId(null);
    }
  };

  useEffect(() => {
    if (!auth || !db) {
      setError(
        "Firebase is not configured. Missing NEXT_PUBLIC_FIREBASE_* env vars.",
      );
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setError("You must be logged in as a business to view posted jobs.");
        setLoading(false);
        router.push("/login");
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) throw new Error("User profile not found.");

        const role = (userSnap.data() as any).role as
          | "driver"
          | "business"
          | "admin"
          | undefined;

        if (role !== "business") {
          throw new Error("Only business accounts can view posted jobs.");
        }

        const jobsRef = collection(db, "jobs");
        const q = query(
          jobsRef,
          where("businessId", "==", user.uid),
          orderBy("createdAt", "desc"),
        );

        const snap = await getDocs(q);
        const now = new Date();

        const fetchedJobs: Job[] = snap.docs
          .map((docSnap) => {
            const data = docSnap.data() as any;

            const createdAt: Date | null = data.createdAt?.toDate
              ? data.createdAt.toDate()
              : null;

            const expiry: Date | null = data.expiry?.toDate
              ? data.expiry.toDate()
              : null;

            const isExpired = !!expiry && expiry <= now;

            const computedStatus: "open" | "closed" | "expired" = isExpired
              ? "expired"
              : data.status || "open";

            return {
              id: docSnap.id,
              title: data.title || "Untitled Job",
              description: data.description || "",
              location: data.location || "",
              vehicleType: data.vehicleType || "",
              pay: data.pay || 0,
              status: data.status || "open",
              createdAt,
              expiry,
              isExpired,
              computedStatus,
            };
          })
          .sort((a, b) => {
            const aExpired = a.isExpired ? 1 : 0;
            const bExpired = b.isExpired ? 1 : 0;
            if (aExpired !== bExpired) return aExpired - bExpired;
            const aTime = a.createdAt?.getTime() ?? 0;
            const bTime = b.createdAt?.getTime() ?? 0;
            return bTime - aTime;
          });

        setJobs(fetchedJobs);
      } catch (err: any) {
        console.error(err);
        setError(err.message || "Failed to load posted jobs.");
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [auth, db, router]);

  const total = jobs.length;
  const openCount = jobs.filter((j) => j.computedStatus === "open").length;

  return (
    <div className="min-h-screen bg-white">
      {/* top glow */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 h-56"
        style={{
          background:
            "radial-gradient(900px 220px at 50% 0%, rgba(243,108,33,0.18), rgba(243,108,33,0) 70%)",
        }}
      />

      <div className="pt-14 pb-20 md:pt-8 md:pb-10">
        <div className="px-4 md:px-6 max-w-5xl mx-auto space-y-5 md:space-y-7">
          {/* Header card */}
          <header className="relative overflow-hidden rounded-3xl border bg-white shadow-sm">
            <div
              className="absolute inset-0"
              aria-hidden
              style={{
                background:
                  "linear-gradient(135deg, rgba(243,108,33,0.20), rgba(243,108,33,0.05), rgba(255,255,255,0.8))",
              }}
            />
            <div className="relative p-5 md:p-7 flex items-start justify-between gap-4">
              <div className="space-y-3 min-w-0">
                <div
                  className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold bg-white"
                  style={{
                    borderColor: BRAND.orangeSoft2,
                    color: BRAND.dark,
                  }}>
                  <Sparkles
                    className="h-4 w-4"
                    style={{ color: BRAND.orange }}
                  />
                  Posted Jobs
                </div>

                <h1
                  className="text-2xl md:text-3xl font-semibold text-gray-900 dark:text-slate-100
">
                  Jobs you&apos;ve posted
                </h1>

                <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
                  <span className="inline-flex items-center gap-2">
                    <Briefcase
                      className="h-4 w-4"
                      style={{ color: BRAND.orange }}
                    />
                    Manage job visibility and view applicants.
                  </span>

                  <span className="text-gray-300">•</span>

                  <span
                    className="inline-flex items-center gap-2 rounded-full border bg-white px-2.5 py-1 text-xs font-semibold"
                    style={{ borderColor: BRAND.orangeSoft2 }}>
                    <Users
                      className="h-4 w-4"
                      style={{ color: BRAND.orange }}
                    />
                    {total} total · {openCount} open
                  </span>
                </div>
              </div>

              <button
                onClick={() => router.push("/business/dashboard")}
                className="inline-flex items-center gap-2 rounded-2xl border bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-800 shadow-sm transition active:scale-[0.99]"
                style={{ borderColor: BRAND.orangeSoft2 }}>
                <ArrowLeft className="h-4 w-4" />
                Dashboard
              </button>
            </div>
          </header>

          {/* States */}
          {loading && (
            <div
              className="rounded-2xl border bg-white p-4 shadow-sm text-sm text-gray-700 flex items-center gap-2"
              style={{ borderColor: BRAND.orangeSoft2 }}>
              <Loader2
                className="h-4 w-4 animate-spin"
                style={{ color: BRAND.orange }}
              />
              Loading jobs…
            </div>
          )}

          {error && !loading && (
            <div className="rounded-2xl border bg-white p-4 shadow-sm text-sm">
              <div
                className="font-semibold text-gray-900 dark:text-slate-100
 mb-1">
                Something went wrong
              </div>
              <div className="text-rose-600">{error}</div>
            </div>
          )}

          {!loading && !error && jobs.length === 0 && (
            <div
              className="rounded-2xl border bg-white p-6 shadow-sm"
              style={{ borderColor: BRAND.orangeSoft2 }}>
              <div
                className="text-gray-900 dark:text-slate-100
 font-semibold">
                No jobs yet
              </div>
              <p className="text-sm text-gray-700 mt-1">
                Post your first job to start receiving driver applications.
              </p>

              <button
                onClick={() => router.push("/business/post-job")}
                className="mt-4 inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-sm transition active:scale-[0.99]"
                style={{
                  background:
                    "linear-gradient(135deg, #F36C21 0%, #FF8A3D 100%)",
                  boxShadow: `0 10px 24px ${BRAND.ring}`,
                }}>
                <Briefcase className="h-4 w-4" />
                Post your first job
              </button>
            </div>
          )}

          {/* Jobs list */}
          {!loading && !error && jobs.length > 0 && (
            <div className="grid grid-cols-1 gap-3 md:gap-4">
              {jobs.map((job) => {
                const isToggling = togglingId === job.id;

                return (
                  <article
                    key={job.id}
                    className="rounded-3xl border bg-white overflow-hidden transition hover:-translate-y-[1px]"
                    style={{
                      borderColor: BRAND.orangeSoft2,
                      boxShadow:
                        "0 1px 0 rgba(0,0,0,0.03), 0 10px 30px rgba(11,18,32,0.06)",
                    }}>
                    <div className="p-4 md:p-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      {/* left */}
                      <div className="min-w-0 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2
                            className="text-lg font-semibold text-gray-900 dark:text-slate-100
 truncate">
                            {job.title}
                          </h2>
                          <StatusBadge status={job.computedStatus} />
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-800">
                          <span className="inline-flex items-center gap-2">
                            <MapPin
                              className="h-4 w-4"
                              style={{ color: BRAND.orange }}
                            />
                            {job.location || "—"}
                          </span>
                          <span className="text-gray-300">•</span>
                          <span className="inline-flex items-center gap-2">
                            <CarFront
                              className="h-4 w-4"
                              style={{ color: BRAND.orange }}
                            />
                            {job.vehicleType || "—"}
                          </span>
                          <span className="text-gray-300">•</span>
                          <span className="inline-flex items-center gap-2 font-semibold">
                            <Banknote
                              className="h-4 w-4"
                              style={{ color: BRAND.orange }}
                            />
                            R{job.pay}
                          </span>
                        </div>

                        {job.description ? (
                          <p className="text-sm text-gray-700 mt-1 line-clamp-2">
                            {job.description}
                          </p>
                        ) : (
                          <p className="text-sm text-gray-500 mt-1">
                            No description provided.
                          </p>
                        )}
                      </div>

                      {/* right */}
                      <div className="flex flex-col gap-2 md:items-end">
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => toggleJobStatus(job)}
                            disabled={job.isExpired || isToggling}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl px-3.5 py-2 text-xs font-semibold text-white transition active:scale-[0.99] disabled:opacity-60"
                            style={{
                              background: job.isExpired
                                ? "#9CA3AF"
                                : job.status === "open"
                                  ? "linear-gradient(135deg, #EF4444 0%, #F97316 100%)"
                                  : "linear-gradient(135deg, #10B981 0%, #34D399 100%)",
                              boxShadow: job.isExpired
                                ? undefined
                                : `0 10px 20px rgba(0,0,0,0.08)`,
                            }}>
                            {isToggling ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Saving…
                              </>
                            ) : job.isExpired ? (
                              "Expired"
                            ) : job.status === "open" ? (
                              "Close Job"
                            ) : (
                              "Reopen Job"
                            )}
                          </button>

                          <button
                            onClick={() =>
                              router.push(
                                `/business/posted-jobs/${job.id}/applicants`,
                              )
                            }
                            className="inline-flex items-center justify-center gap-2 rounded-2xl px-3.5 py-2 text-xs font-semibold text-white transition active:scale-[0.99]"
                            style={{
                              background:
                                "linear-gradient(135deg, #F36C21 0%, #FF8A3D 100%)",
                              boxShadow: `0 10px 24px ${BRAND.ring}`,
                            }}>
                            <Users className="h-4 w-4" />
                            View Applicants
                          </button>
                        </div>

                        <div className="flex flex-col gap-1 text-xs text-gray-600">
                          <span className="inline-flex items-center gap-2">
                            <Calendar
                              className="h-3.5 w-3.5"
                              style={{ color: BRAND.orange }}
                            />
                            Posted: {formatDate(job.createdAt)}
                          </span>
                          <span className="inline-flex items-center gap-2">
                            <Calendar
                              className="h-3.5 w-3.5"
                              style={{ color: BRAND.orange }}
                            />
                            Expires: {formatDate(job.expiry)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* subtle bottom accent */}
                    <div
                      aria-hidden
                      className="h-1 w-full"
                      style={{
                        background:
                          "linear-gradient(90deg, rgba(243,108,33,0.65), rgba(243,108,33,0.05))",
                      }}
                    />
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const PostedJobsPage = dynamic(() => Promise.resolve(PostedJobsPageContent), {
  ssr: false,
});

export default PostedJobsPage;
