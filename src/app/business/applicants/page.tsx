"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  orderBy,
  where,
  limit,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { app } from "@/lib/firebase";
import {
  Search,
  Users,
  Briefcase,
  MessageSquare,
  ChevronRight,
} from "lucide-react";
import dynamic from "next/dynamic";

type ApplicantRow = {
  id: string; // application doc id
  driverId: string;
  driverName?: string;
  driverPhone?: string;
  message?: string;
  createdAt?: Date | null;

  // you may have extra fields; keep them if you want
  [key: string]: any;
};

const formatDateTime = (d?: Date | null) => {
  if (!d) return "—";
  return d.toLocaleString();
};

function initials(name?: string) {
  if (!name) return "DR";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase()).join("") || "DR";
}

function ApplicantsPageContent() {
  const router = useRouter();
  const params = useParams<{ jobId: string }>();
  const jobId = params?.jobId;

  const auth = getAuth(app);
  const db = getFirestore(app);

  const [jobTitle, setJobTitle] = useState<string>("Job");
  const [applicants, setApplicants] = useState<ApplicantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingThreadId, setCreatingThreadId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    if (!jobId) return;

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // 1) Fetch job title (so we can show it + store it in thread)
        const jobRef = doc(db, "jobs", jobId);
        const jobSnap = await getDoc(jobRef);
        if (jobSnap.exists()) {
          const data = jobSnap.data() as any;
          setJobTitle(data?.title || "Job");
        } else {
          setJobTitle("Job");
        }

        // 2) Fetch applications: jobs/{jobId}/applications
        const appsRef = collection(db, "jobs", jobId, "applications");
        const q = query(appsRef, orderBy("createdAt", "desc"));
        const snap = await getDocs(q);

        const list: ApplicantRow[] = snap.docs.map((d) => {
          const data = d.data() as any;
          const createdAt = data.createdAt?.toDate
            ? data.createdAt.toDate()
            : null;

          return {
            id: d.id,
            driverId: data.driverId,
            driverName: data.driverName,
            driverPhone: data.driverPhone,
            message: data.message,
            createdAt,
            ...data,
          };
        });

        setApplicants(list);
      } catch (e: any) {
        console.error(e);
        setError(e.message || "Failed to load applicants.");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [auth, db, router, jobId]);

  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return applicants;
    return applicants.filter((a) => {
      const haystack = [
        a.driverName || "",
        a.driverId || "",
        a.driverPhone || "",
        a.message || "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [applicants, searchText]);

  const openOrCreateThread = async (a: ApplicantRow) => {
    const user = auth.currentUser;
    if (!user) {
      router.push("/login");
      return;
    }

    if (!a.driverId) {
      setError("This application is missing driverId.");
      return;
    }

    try {
      setCreatingThreadId(a.id);
      setError(null);

      // Try find existing thread first:
      // threads where businessId == user.uid AND jobId == jobId AND driverId == a.driverId
      const threadsRef = collection(db, "threads");
      const existingQ = query(
        threadsRef,
        where("businessId", "==", user.uid),
        where("jobId", "==", jobId),
        where("driverId", "==", a.driverId),
        limit(1),
      );

      const existingSnap = await getDocs(existingQ);
      if (!existingSnap.empty) {
        const threadDoc = existingSnap.docs[0];
        router.push(`/business/chats/${threadDoc.id}`);
        return;
      }

      // Create new thread
      const created = await addDoc(threadsRef, {
        businessId: user.uid,
        jobId,
        jobTitle, // so inbox can show title
        driverId: a.driverId,
        driverName: a.driverName || null,

        lastMessageText: null,
        lastMessageAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      });

      router.push(`/business/chats/${created.id}`);
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Failed to create/open chat.");
    } finally {
      setCreatingThreadId(null);
    }
  };

  return (
    <div className="min-h-[calc(100vh-64px)] bg-gray-50">
      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
              Applicants
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Applicants for: <span className="font-medium">{jobTitle}</span>
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs text-gray-600">
            <span className="inline-flex items-center gap-1 rounded-full bg-white border px-3 py-1">
              <Briefcase className="h-3.5 w-3.5" />
              Job: {jobId}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-white border px-3 py-1">
              <Users className="h-3.5 w-3.5" />
              {applicants.length} applicant{applicants.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white border rounded-2xl shadow-sm p-3 sm:p-4">
          <div className="relative w-full sm:max-w-md">
            <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search by name, phone, or message..."
              className="w-full rounded-xl border bg-gray-50 pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-200"
            />
          </div>
        </div>

        {/* States */}
        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="bg-white border rounded-2xl shadow-sm p-4 animate-pulse">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-gray-200" />
                    <div className="space-y-2">
                      <div className="h-4 w-40 bg-gray-200 rounded" />
                      <div className="h-3 w-56 bg-gray-200 rounded" />
                    </div>
                  </div>
                  <div className="h-3 w-20 bg-gray-200 rounded" />
                </div>
                <div className="h-3 w-2/3 bg-gray-200 rounded mt-3" />
              </div>
            ))}
          </div>
        )}

        {error && !loading && (
          <div className="bg-white border rounded-2xl shadow-sm p-4">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="bg-white border rounded-2xl shadow-sm p-8 text-center">
            <div className="mx-auto h-12 w-12 rounded-2xl bg-gray-50 border flex items-center justify-center">
              <Users className="h-6 w-6 text-gray-500" />
            </div>
            <h2 className="mt-4 text-lg font-semibold">No applicants found</h2>
            <p className="mt-1 text-sm text-gray-600">
              {applicants.length === 0
                ? "No one has applied yet."
                : "Try changing your search."}
            </p>
          </div>
        )}

        {/* List */}
        {!loading && !error && filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map((a) => (
              <div
                key={a.id}
                className="bg-white border rounded-2xl shadow-sm p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-full bg-gray-900 text-white flex items-center justify-center text-xs font-semibold shrink-0">
                      {initials(a.driverName)}
                    </div>

                    <div className="min-w-0">
                      <p
                        className="font-semibold text-gray-900 dark:text-slate-100
 truncate">
                        {a.driverName || `Driver: ${a.driverId}`}
                      </p>

                      <p className="text-xs text-gray-600 mt-1">
                        {a.driverPhone ? `Phone: ${a.driverPhone}` : "Phone: —"}
                        <span className="mx-2">•</span>
                        Applied: {formatDateTime(a.createdAt)}
                      </p>

                      <p className="mt-2 text-sm text-gray-700 line-clamp-2">
                        {a.message || "No message provided."}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => openOrCreateThread(a)}
                      disabled={creatingThreadId === a.id}
                      className="inline-flex items-center gap-2 rounded-xl bg-gray-900 text-white px-3 py-2 text-sm font-medium hover:bg-black transition disabled:opacity-60">
                      <MessageSquare className="h-4 w-4" />
                      {creatingThreadId === a.id ? "Opening..." : "Message"}
                    </button>

                    <button
                      onClick={() => router.push(`/business/chats`)}
                      className="hidden sm:inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition"
                      title="Go to inbox">
                      Inbox <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const ApplicantsPage = dynamic(() => Promise.resolve(ApplicantsPageContent), {
  ssr: false,
});

export default ApplicantsPage;
