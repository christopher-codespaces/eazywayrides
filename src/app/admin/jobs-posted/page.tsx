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

const formatDate = (value: any) => {
  if (!value) return "-";
  if (value.toDate) return value.toDate().toLocaleDateString();
  return "-";
};

export default function JobsPostedPage() {
  /**
   * Firebase client dependencies (Auth + Firestore)
   * ---------------------------------------------------------------------------
   * The Firebase client `app` may be `null` when NEXT_PUBLIC_FIREBASE_* env vars
   * are not configured (e.g. local development, CI, or review builds).
   *
   * To prevent build-time or prerender crashes:
   * - Auth and Firestore are initialised only when `app` exists
   * - Otherwise both remain null and the UI exits gracefully
   *
   * When environment variables are provided:
   * - `app` becomes available
   * - Auth/Firestore initialises normally
   * - No behaviour change from the original implementation
   */
  const auth = useMemo(() => (app ? getAuth(app) : null), [app]);
  const db = useMemo(() => (app ? getFirestore(app) : null), [app]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [jobs, setJobs] = useState<any[]>([]);

  /**
   * Deletes a job document (admin-only action).
   *
   * Guard behaviour:
   * - If Firestore is not available (missing client env vars),
   *   exit with a clear error message instead of throwing.
   */
  const deleteJob = async (jobId: string) => {
    setError(null);

    // Guard: Firebase client not configured
    if (!db) {
      setError("Firebase is not configured. Missing NEXT_PUBLIC_FIREBASE_* env vars.");
      return;
    }

    const ok = window.confirm("Delete this job? This cannot be undone");
    if (!ok) return;

    try {
      await deleteDoc(doc(db, "jobs", jobId));

      // Remove from UI
      setJobs((prev) => prev.filter((j: any) => j.id !== jobId));
    } catch (e: any) {
      setError(e?.message || "Failed to delete job");
    }
  };

  /**
   * Admin verification
   * ---------------------------------------------------------------------------
   * Verifies the logged-in user has role = "admin" before allowing access.
   *
   * Guard behaviour:
   * - If Firebase Auth/Firestore is not available (missing client env vars),
   *   exit early with a clear error message.
   */
  useEffect(() => {
    setLoading(true);
    setError(null);
    setIsAdmin(false);

    // Guard: Firebase client not configured
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

  /**
   * Jobs fetch (admin only)
   * ---------------------------------------------------------------------------
   * Loads jobs ordered by createdAt desc once admin access is confirmed.
   *
   * Guard behaviour:
   * - If Firestore is not available, exit early with a clear error message.
   */
  useEffect(() => {
    if (!isAdmin) return;

    // Guard: Firebase client not configured
    if (!db) {
      setError("Firebase is not configured. Missing NEXT_PUBLIC_FIREBASE_* env vars.");
      return;
    }

    const fetchJobs = async () => {
      try {
        const jobsRef = collection(db, "jobs");
        const q = query(jobsRef, orderBy("createdAt", "desc"));
        const snap = await getDocs(q);

        const now = new Date();

        const list = snap.docs
          .map((d) => {
            const data = d.data() as any;

            const expiry: Date | null =
              data.expiry?.toDate ? data.expiry.toDate() : null;

            const createdAt: Date | null =
              data.createdAt?.toDate ? data.createdAt.toDate() : null;

            const isExpired = !!expiry && expiry <= now;

            // UI status: expired overrides DB status
            const computedStatus = isExpired ? "expired" : (data.status || "open");

            return {
              id: d.id,
              ...data,
              createdAt,
              expiry,
              isExpired,
              computedStatus, // "open" | "closed" | "expired"
            };
          })
          // optional: keep non-expired first
          .sort((a: any, b: any) => (a.isExpired ? 1 : 0) - (b.isExpired ? 1 : 0));

        setJobs(list);
      } catch (e: any) {
        setError(e?.message || "Failed to load jobs.");
      }
    };

    fetchJobs();
  }, [isAdmin, db]);

  if (loading) return <div className="p-6">Loading...</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!isAdmin) return <div className="p-6">Not authorized</div>;

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">All Jobs</h1>
      <p className="text-sm text-gray-600">Total jobs: {jobs.length}</p>

      {jobs.map((job: any) => (
        <div key={job.id} className="border rounded-lg p-4 bg-white">
          <div className="font-semibold">{job.title}</div>
          <div className="text-sm text-gray-600">{job.businessName}</div>

          <div className="text-sm mt-2 space-y-1">
            <div>Location: {job.location}</div>
            <div>Vehicle: {job.vehicleType}</div>
            <div>Pay: R{job.pay}</div>
            <div>Status: {job.computedStatus}</div>
            <div>Created: {formatDate(job.createdAt)}</div>
            <div>Expires: {formatDate(job.expiry)}</div>
          </div>

          <div className="mt-3 flex gap-2">
            <button
              onClick={() => deleteJob(job.id)}
              className="mt-3 px-3 py-2 rounded bg-red-600 text-white hover:bg-red-700"
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
