"use client";

import { useEffect, useMemo, useState } from "react";
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
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { app } from "@/lib/firebase";
import { MapPin, Truck, Banknote, Calendar, Briefcase } from "lucide-react";

// Shape of job docs we render in the UI
interface Job {
  id: string;
  title: string;
  description?: string;
  location: string;
  vehicleType: string;
  pay: number;
  businessName: string;
  status: string;
  expiry?: Date | null; // Firestore Timestamp -> Date
}

// Small UI helper (keeps JSX clean)
const formatDate = (date?: Date | null) => {
  if (!date) return "—";
  return date.toLocaleDateString();
};

// ZA phone normalization + validation
const normalizeZaPhone = (input: string) => input.trim().replace(/\s+/g, "");
const isValidZaPhone = (input: string) => {
  const p = normalizeZaPhone(input);
  if (/^0\d{9}$/.test(p)) return true; // local
  if (/^\+27\d{9}$/.test(p)) return true; // international
  return false;
};

export default function DriverJobsPage() {
  const db = useMemo(() => (app ? getFirestore(app) : null), []);
  const auth = useMemo(() => (app ? getAuth(app) : null), []);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [applyingJobId, setApplyingJobId] = useState<string | null>(null);
  const [appliedJobIds, setAppliedJobIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let isMounted = true;

    const fetchJobs = async (): Promise<Job[]> => {
      if (!db) {
        throw new Error(
          "Firebase is not configured. Missing NEXT_PUBLIC_FIREBASE_* env vars.",
        );
      }

      const jobsRef = collection(db, "jobs");
      const q = query(
        jobsRef,
        where("status", "==", "open"),
        orderBy("createdAt", "desc"),
      );

      const snapshot = await getDocs(q);
      const now = new Date();

      return snapshot.docs
        .map((docSnap) => {
          const data = docSnap.data() as any;
          return {
            id: docSnap.id,
            title: data.title,
            description: data.description,
            location: data.location,
            vehicleType: data.vehicleType,
            pay: data.pay,
            businessName: data.businessName,
            status: data.status,
            expiry: data.expiry?.toDate ? data.expiry.toDate() : null,
          } as Job;
        })
        .filter((job) => !job.expiry || job.expiry > now);
    };

    const fetchAppliedJobIds = async (uid: string, jobsList: Job[]) => {
      if (!db) return new Set<string>();

      const checks = await Promise.all(
        jobsList.map(async (job) => {
          const appRef = doc(db, "jobs", job.id, "applications", uid);
          const snap = await getDoc(appRef);
          return snap.exists() ? job.id : null;
        }),
      );

      const set = new Set<string>();
      for (const id of checks) if (id) set.add(id);
      return set;
    };

    const run = async () => {
      try {
        setError(null);
        setSuccess(null);
        setLoading(true);

        if (!db || !auth) {
          if (!isMounted) return;
          setError(
            "Firebase is not configured. Missing NEXT_PUBLIC_FIREBASE_* env vars.",
          );
          setLoading(false);
          return;
        }

        const unsubscribe = onAuthStateChanged(auth, async (user) => {
          try {
            const jobsList = await fetchJobs();
            if (!isMounted) return;

            setJobs(jobsList);

            if (!user) {
              setAppliedJobIds(new Set());
              return;
            }

            const userRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userRef);
            const userData = userSnap.exists()
              ? (userSnap.data() as any)
              : null;

            if (!userData || userData.role !== "driver") {
              setAppliedJobIds(new Set());
              return;
            }

            const appliedSet = await fetchAppliedJobIds(user.uid, jobsList);
            if (!isMounted) return;

            setAppliedJobIds(appliedSet);
          } catch (e: any) {
            console.error("Driver jobs init error:", e);
            if (!isMounted) return;
            setError(`Failed to load jobs: ${e?.message || "Unknown error"}`);
          } finally {
            if (!isMounted) return;
            setLoading(false);
          }
        });

        return unsubscribe;
      } catch (err: any) {
        console.error("Init error:", err);
        if (!isMounted) return;
        setError(`Failed to load jobs: ${err?.message || "Unknown error"}`);
        setLoading(false);
        return undefined;
      }
    };

    let unsubscribe: undefined | (() => void);

    run().then((u) => {
      unsubscribe = u;
    });

    return () => {
      isMounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, [auth, db]);

  const applyToJob = async (jobId: string) => {
    setError(null);
    setSuccess(null);

    if (!auth || !db) {
      setError(
        "Firebase is not configured. Missing NEXT_PUBLIC_FIREBASE_* env vars.",
      );
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      setError("You must be logged in to apply.");
      return;
    }

    setApplyingJobId(jobId);

    try {
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        setError("User profile not found.");
        return;
      }

      const userData = userSnap.data() as any;

      if (userData.role !== "driver") {
        setError("Only driver accounts can apply to jobs.");
        return;
      }

      const driverPhoneRaw = (userData.phone as string | undefined) ?? "";
      const driverPhone = normalizeZaPhone(driverPhoneRaw);

      if (!driverPhone || !isValidZaPhone(driverPhone)) {
        setError(
          "Your phone number is missing or invalid. Please complete signup and add a valid South African phone number (e.g. 0821234567 or +27821234567).",
        );
        return;
      }

      const appRef = doc(db, "jobs", jobId, "applications", user.uid);

      const existing = await getDoc(appRef);
      if (existing.exists()) {
        setAppliedJobIds((prev) => new Set(prev).add(jobId));
        setSuccess("You already applied to this job.");
        return;
      }

      await setDoc(appRef, {
        driverId: user.uid,
        driverName: userData.name || "Unknown",
        driverEmail: user.email ?? "",
        driverPhone,
        message: "",
        status: "submitted",
        createdAt: serverTimestamp(),
      });

      setAppliedJobIds((prev) => new Set(prev).add(jobId));
      setSuccess("Application submitted.");
    } catch (err: any) {
      console.error("Apply error:", err);
      setError(`Failed to apply: ${err?.message || "Unknown error"}`);
    } finally {
      setApplyingJobId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">
                <Briefcase className="h-4 w-4" />
                Driver Jobs
              </div>

              <h1
                className="mt-3 text-2xl font-semibold text-gray-900 dark:text-slate-100
 md:text-3xl">
                Available Jobs
              </h1>

              <p className="mt-2 max-w-2xl text-sm text-gray-600">
                Browse open jobs posted by businesses. Apply in one click and
                track your application status.
              </p>
            </div>
          </div>

          {/* Alerts */}
          <div className="mt-4 space-y-2">
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {success && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {success}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
        {loading && (
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <div className="animate-pulse space-y-3">
              <div className="h-4 w-40 rounded bg-gray-200" />
              <div className="h-3 w-72 rounded bg-gray-200" />
              <div className="h-3 w-64 rounded bg-gray-200" />
            </div>
            <p className="mt-4 text-sm text-gray-600">Loading jobs…</p>
          </div>
        )}

        {!loading && !error && jobs.length === 0 && (
          <div className="rounded-2xl border bg-white p-10 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-orange-50 text-orange-700">
              <Briefcase className="h-6 w-6" />
            </div>
            <h2
              className="mt-4 text-lg font-semibold text-gray-900 dark:text-slate-100
">
              No jobs available right now
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              Check back soon. When businesses post jobs, you’ll see them here.
            </p>
          </div>
        )}

        {!loading && jobs.length > 0 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {jobs.map((job) => {
              const isApplied = appliedJobIds.has(job.id);
              const isApplying = applyingJobId === job.id;

              return (
                <div
                  key={job.id}
                  className="rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2
                        className="text-lg font-semibold text-gray-900 dark:text-slate-100
">
                        {job.title}
                      </h2>
                      <p className="mt-1 text-sm text-gray-600">
                        Posted by{" "}
                        <span
                          className="font-medium text-gray-900 dark:text-slate-100
">
                          {job.businessName}
                        </span>
                      </p>
                    </div>

                    <span
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                        isApplied
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-gray-50 text-gray-700 border border-gray-200"
                      }`}>
                      {isApplied ? "Applied" : "Open"}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-2 text-sm text-gray-700">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-gray-500" />
                      <span>
                        <span className="font-medium">Location:</span>{" "}
                        {job.location}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Truck className="h-4 w-4 text-gray-500" />
                      <span>
                        <span className="font-medium">Vehicle:</span>{" "}
                        {job.vehicleType}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Banknote className="h-4 w-4 text-gray-500" />
                      <span>
                        <span className="font-medium">Pay:</span> R{job.pay}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-gray-500" />
                      <span>
                        <span className="font-medium">Expires:</span>{" "}
                        {formatDate(job.expiry)}
                      </span>
                    </div>
                  </div>

                  {job.description ? (
                    <p className="mt-4 text-sm text-gray-600 line-clamp-3">
                      {job.description}
                    </p>
                  ) : (
                    <p className="mt-4 text-sm text-gray-500 italic">
                      No description provided.
                    </p>
                  )}

                  <button
                    className={`mt-5 w-full rounded-xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed ${
                      isApplied
                        ? "bg-gray-100 text-gray-600"
                        : "bg-orange-600 text-white hover:bg-orange-700"
                    }`}
                    disabled={isApplied || isApplying || !auth || !db}
                    onClick={() => applyToJob(job.id)}>
                    {isApplying ? "Applying…" : isApplied ? "Applied" : "Apply"}
                  </button>

                  {!auth || !db ? (
                    <p className="mt-2 text-xs text-red-600">
                      Firebase not configured (missing env vars).
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
