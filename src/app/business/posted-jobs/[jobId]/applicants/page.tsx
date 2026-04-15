"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  query,
  orderBy,
  getDocs,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  ArrowLeft,
  MessageSquare,
  Phone,
  Mail,
  Calendar,
  BadgeCheck,
  Users,
  Sparkles,
  Loader2,
} from "lucide-react";
import { app } from "@/lib/firebase";

type Applicant = {
  id: string; // driverId (uid as doc id)
  driverName?: string;
  driverEmail?: string;
  driverPhone?: string;
  message?: string;
  status?: string;
  createdAt?: Date | null;
};

const BRAND = {
  orange: "#F36C21",
  orangeSoft: "#FFF3EC",
  orangeSoft2: "#FFE6D6",
  dark: "#0B1220",
  ring: "rgba(243,108,33,0.22)",
};

const formatDateTime = (date?: Date | null) => {
  if (!date) return "—";
  return date.toLocaleString();
};

const statusPill = (status?: string) => {
  const s = (status || "submitted").toLowerCase();
  const label = s.toUpperCase();

  const base =
    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold border";

  if (s === "accepted") {
    return (
      <span className={`${base} bg-white text-emerald-700 border-emerald-200`}>
        <BadgeCheck className="h-3.5 w-3.5" />
        {label}
      </span>
    );
  }

  if (s === "rejected") {
    return (
      <span className={`${base} bg-white text-rose-700 border-rose-200`}>
        {label}
      </span>
    );
  }

  if (s === "shortlisted") {
    return (
      <span className={`${base} bg-white text-amber-700 border-amber-200`}>
        {label}
      </span>
    );
  }

  // default: orange-tinted "submitted"
  return (
    <span
      className={`${base} bg-white`}
      style={{
        color: BRAND.orange,
        borderColor: BRAND.orangeSoft2,
      }}>
      {label}
    </span>
  );
};

export default function ApplicantsForJobPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const router = useRouter();

  const auth = useMemo(() => (app ? getAuth(app) : null), []);
  const db = useMemo(() => (app ? getFirestore(app) : null), []);

  const [pageTitle, setPageTitle] = useState<string>("Job Applicants");
  const [jobTitle, setJobTitle] = useState<string>("");

  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [startingChatFor, setStartingChatFor] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;
    if (!auth || !db) return;

    setLoading(true);
    setError(null);

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // 1) Confirm business role (UX check)
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) throw new Error("User profile not found.");

        const userData = userSnap.data() as any;
        if (userData.role !== "business") {
          throw new Error("Only business accounts can view applicants.");
        }

        // 2) Load job doc (title + ownership check)
        const jobRef = doc(db, "jobs", jobId);
        const jobSnap = await getDoc(jobRef);
        if (!jobSnap.exists()) throw new Error("Job not found.");

        const jobData = jobSnap.data() as any;
        const jt = (jobData.title as string) || "";
        setJobTitle(jt);
        setPageTitle(jt || "Job Applicants");

        if (jobData.businessId !== user.uid) {
          throw new Error("You do not own this job.");
        }

        // 3) Load applications
        const appsRef = collection(db, "jobs", jobId, "applications");
        const q = query(appsRef, orderBy("createdAt", "desc"));
        const snap = await getDocs(q);

        const list: Applicant[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            driverName: data.driverName,
            driverEmail: data.driverEmail,
            driverPhone: data.driverPhone,
            message: data.message,
            status: data.status,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : null,
          };
        });

        setApplicants(list);
      } catch (err: any) {
        console.error(err);
        setError(err?.message || "Failed to load applicants.");
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [auth, db, jobId, router]);

  const startChatWithDriver = async (driverId: string, driverName?: string) => {
    if (!auth || !db) {
      router.push("/login");
      return;
    }
    const user = auth.currentUser;
    if (!user) {
      router.push("/login");
      return;
    }
    if (!jobId) {
      setError("Missing jobId.");
      return;
    }

    const threadId = `${jobId}_${driverId}`;
    setStartingChatFor(driverId);
    setError(null);

    try {
      const threadRef = doc(db, "threads", threadId);

      await setDoc(threadRef, {
        threadId,
        jobId,
        jobTitle: jobTitle || pageTitle || "",
        businessId: user.uid,
        driverId,
        driverName: driverName || "",
        createdAt: serverTimestamp(),
        lastMessageAt: serverTimestamp(),
        lastMessageText: "",
      });

      router.push(`/business/chats/${threadId}`);
    } catch (e: any) {
      console.error(e);

      if (e?.code === "permission-denied") {
        router.push(`/business/chats/${threadId}`);
        return;
      }

      setError(
        `${e?.code ?? "error"}: ${e?.message ?? "Failed to start chat."}`,
      );
    } finally {
      setStartingChatFor(null);
    }
  };

  const total = applicants.length;

  return (
    <div className="min-h-screen bg-white">
      {/* top glow */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 h-56"
        style={{
          background:
            "radial-gradient(800px 220px at 50% 0%, rgba(243,108,33,0.18), rgba(243,108,33,0) 70%)",
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
                  "linear-gradient(135deg, rgba(243,108,33,0.20), rgba(243,108,33,0.05), rgba(255,255,255,0.7))",
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
                  Applicants
                </div>

                <h1
                  className="text-2xl md:text-3xl font-semibold text-gray-900 dark:text-slate-100
 truncate">
                  {pageTitle}
                </h1>

                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm text-gray-700">
                    Review applicants and message drivers directly.
                  </p>

                  <span className="text-gray-300">•</span>

                  <span
                    className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold bg-white"
                    style={{ borderColor: BRAND.orangeSoft2 }}>
                    <Users
                      className="h-3.5 w-3.5"
                      style={{ color: BRAND.orange }}
                    />
                    {total} {total === 1 ? "applicant" : "applicants"}
                  </span>
                </div>
              </div>

              <button
                onClick={() => router.push("/business/posted-jobs")}
                className="inline-flex items-center gap-2 rounded-2xl border bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-800 shadow-sm transition active:scale-[0.99]"
                style={{ borderColor: BRAND.orangeSoft2 }}>
                <ArrowLeft className="h-4 w-4" />
                Back
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
              Loading applicants…
            </div>
          )}

          {error && !loading && (
            <div className="rounded-2xl border bg-white p-4 shadow-sm text-sm">
              <div
                className="font-semibold text-gray-900 dark:text-slate-100
 mb-1">
                Couldn’t load applicants
              </div>
              <div className="text-rose-600">{error}</div>
            </div>
          )}

          {!loading && !error && applicants.length === 0 && (
            <div
              className="rounded-2xl border bg-white p-6 shadow-sm"
              style={{ borderColor: BRAND.orangeSoft2 }}>
              <div
                className="text-gray-900 dark:text-slate-100
 font-semibold">
                No applicants yet
              </div>
              <p className="text-sm text-gray-700 mt-1">
                Once drivers apply, they’ll show up here with contact details
                and their message.
              </p>
            </div>
          )}

          {/* List */}
          {!loading && !error && applicants.length > 0 && (
            <div className="grid grid-cols-1 gap-3 md:gap-4">
              {applicants.map((a) => {
                const isStarting = startingChatFor === a.id;

                return (
                  <article
                    key={a.id}
                    className="rounded-3xl border bg-white shadow-sm overflow-hidden transition hover:-translate-y-[1px]"
                    style={{
                      borderColor: BRAND.orangeSoft2,
                      boxShadow: `0 1px 0 rgba(0,0,0,0.03), 0 10px 30px rgba(11,18,32,0.06)`,
                    }}>
                    {/* top row */}
                    <div className="p-4 md:p-6 flex items-start justify-between gap-4">
                      <div className="min-w-0 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div
                            className="text-base md:text-lg font-semibold text-gray-900 dark:text-slate-100
 truncate">
                            {a.driverName || "Unknown Driver"}
                          </div>
                          {statusPill(a.status)}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm text-gray-800">
                          <div className="flex items-center gap-2 min-w-0">
                            <Mail
                              className="h-4 w-4 shrink-0"
                              style={{ color: BRAND.orange }}
                            />
                            <span className="truncate">
                              {a.driverEmail || "—"}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 min-w-0">
                            <Phone
                              className="h-4 w-4 shrink-0"
                              style={{ color: BRAND.orange }}
                            />
                            {a.driverPhone ? (
                              <a
                                className="font-semibold hover:underline"
                                style={{ color: BRAND.orange }}
                                href={`tel:${a.driverPhone}`}>
                                {a.driverPhone}
                              </a>
                            ) : (
                              <span>—</span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 min-w-0">
                            <Calendar
                              className="h-4 w-4 shrink-0"
                              style={{ color: BRAND.orange }}
                            />
                            <span className="truncate">
                              Applied: {formatDateTime(a.createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* actions (desktop) */}
                      <div className="hidden md:flex flex-col items-end gap-2 shrink-0">
                        <button
                          onClick={() =>
                            startChatWithDriver(a.id, a.driverName)
                          }
                          disabled={isStarting}
                          className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition active:scale-[0.99] disabled:opacity-60"
                          style={{
                            background:
                              "linear-gradient(135deg, #F36C21 0%, #FF8A3D 100%)",
                            boxShadow: `0 10px 24px ${BRAND.ring}`,
                          }}>
                          {isStarting ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Opening…
                            </>
                          ) : (
                            <>
                              <MessageSquare className="h-4 w-4" />
                              Message
                            </>
                          )}
                        </button>

                        <button
                          onClick={() =>
                            router.push(`/business/chats/${jobId}_${a.id}`)
                          }
                          className="text-xs font-semibold transition"
                          style={{ color: BRAND.orange }}
                          title="Open thread (if already created)">
                          Open thread →
                        </button>
                      </div>
                    </div>

                    {/* message block */}
                    <div className="px-4 md:px-6 pb-4 md:pb-6">
                      <div
                        className="rounded-2xl border p-4 text-sm"
                        style={{
                          borderColor: BRAND.orangeSoft2,
                          background: BRAND.orangeSoft,
                        }}>
                        <div className="text-xs font-semibold text-gray-700 mb-1">
                          Driver message
                        </div>
                        <div
                          className="whitespace-pre-wrap text-gray-900 dark:text-slate-100
">
                          {a.message ? a.message : "No message included."}
                        </div>
                      </div>
                    </div>

                    {/* mobile actions */}
                    <div className="md:hidden border-t bg-white p-3">
                      <button
                        onClick={() => startChatWithDriver(a.id, a.driverName)}
                        disabled={isStarting}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-sm transition active:scale-[0.99] disabled:opacity-60"
                        style={{
                          background:
                            "linear-gradient(135deg, #F36C21 0%, #FF8A3D 100%)",
                          boxShadow: `0 10px 24px ${BRAND.ring}`,
                        }}>
                        {isStarting ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Opening…
                          </>
                        ) : (
                          <>
                            <MessageSquare className="h-4 w-4" />
                            Message Driver
                          </>
                        )}
                      </button>
                    </div>
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
