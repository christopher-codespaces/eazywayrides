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
} from "firebase/firestore";
import { app } from "@/lib/firebase";
import dynamic from "next/dynamic";

// Optional: if you already have lucide-react installed (you used it earlier),
// this makes the UI feel much more "product".
import {
  Search,
  MessageSquare,
  Briefcase,
  Clock,
  ChevronRight,
} from "lucide-react";

type ThreadRow = {
  id: string; // threadId
  jobId: string;
  jobTitle?: string;
  driverId: string;
  driverName?: string;
  lastMessageText?: string;
  lastMessageAt?: Date | null;

  // Optional (only if you store it in Firestore later)
  // unreadCount?: number;
};

const formatDateTime = (d?: Date | null) => {
  if (!d) return "—";
  return d.toLocaleString();
};

const formatRelative = (d?: Date | null) => {
  if (!d) return "—";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
};

function initials(name?: string) {
  if (!name) return "DR";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase()).join("") || "DR";
}

function BusinessChatsPageContent() {
  const router = useRouter();

  // Use the "app" instance if your firebase wrapper expects it.
  // If your current code works without passing app, keep as-is.
  const auth = getAuth(app);
  const db = getFirestore(app);

  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [searchText, setSearchText] = useState("");
  const [filter, setFilter] = useState<"all" | "withMessages">("all");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Business inbox = all threads where businessId == my uid.
        const threadsRef = collection(db, "threads");
        const q = query(
          threadsRef,
          where("businessId", "==", user.uid),
          orderBy("lastMessageAt", "desc"),
        );

        const snap = await getDocs(q);

        const list: ThreadRow[] = snap.docs.map((d) => {
          const data = d.data() as any;
          const last = data.lastMessageAt?.toDate
            ? data.lastMessageAt.toDate()
            : null;

          return {
            id: d.id,
            jobId: data.jobId,
            jobTitle: data.jobTitle,
            driverId: data.driverId,
            driverName: data.driverName,
            lastMessageText: data.lastMessageText,
            lastMessageAt: last,
            // unreadCount: data.unreadCount ?? 0,
          };
        });

        setThreads(list);
      } catch (e: any) {
        console.error(e);
        setError(e.message || "Failed to load chats.");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [auth, db, router]);

  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return threads
      .filter((t) => {
        if (filter === "withMessages") return !!t.lastMessageText;
        return true;
      })
      .filter((t) => {
        if (!q) return true;
        const haystack = [
          t.driverName || "",
          t.driverId || "",
          t.jobTitle || "",
          t.jobId || "",
          t.lastMessageText || "",
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      });
  }, [threads, searchText, filter]);

  return (
    <div className="min-h-[calc(100vh-64px)] bg-gray-50">
      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
              Chats
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Conversations with applicants (one chat per job per driver).
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs text-gray-600">
            <span className="inline-flex items-center gap-1 rounded-full bg-white border px-3 py-1">
              <MessageSquare className="h-3.5 w-3.5" />
              {threads.length} thread{threads.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white border rounded-2xl shadow-sm p-3 sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-md">
              <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Search by driver, job, or message..."
                className="w-full rounded-xl border bg-gray-50 pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-200"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setFilter("all")}
                className={`px-3 py-2 rounded-xl text-sm border transition ${
                  filter === "all"
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-700 hover:bg-gray-50"
                }`}>
                All
              </button>
              <button
                onClick={() => setFilter("withMessages")}
                className={`px-3 py-2 rounded-xl text-sm border transition ${
                  filter === "withMessages"
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-700 hover:bg-gray-50"
                }`}>
                With messages
              </button>
            </div>
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
                  <div className="h-3 w-16 bg-gray-200 rounded" />
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
              <MessageSquare className="h-6 w-6 text-gray-500" />
            </div>
            <h2 className="mt-4 text-lg font-semibold">No chats found</h2>
            <p className="mt-1 text-sm text-gray-600">
              {threads.length === 0
                ? "No chats yet. Start one from an applicant list."
                : "Try changing your search or filter."}
            </p>
          </div>
        )}

        {/* List */}
        {!loading && !error && filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map((t) => (
              <button
                key={t.id}
                onClick={() => router.push(`/business/chats/${t.id}`)}
                className="group w-full text-left bg-white border rounded-2xl shadow-sm hover:shadow-md transition p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    {/* Avatar */}
                    <div className="h-10 w-10 rounded-full bg-gray-900 text-white flex items-center justify-center text-xs font-semibold shrink-0">
                      {initials(t.driverName)}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p
                          className="font-semibold text-gray-900 dark:text-slate-100
 truncate">
                          {t.driverName
                            ? t.driverName
                            : `Driver: ${t.driverId}`}
                        </p>

                        {/* Optional unread dot if you store unreadCount */}
                        {/* {t.unreadCount ? (
                          <span className="h-2 w-2 rounded-full bg-blue-500" />
                        ) : null} */}
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-600">
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 border px-2 py-1">
                          <Briefcase className="h-3.5 w-3.5" />
                          {t.jobTitle ? t.jobTitle : t.jobId}
                        </span>

                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 border px-2 py-1">
                          <Clock className="h-3.5 w-3.5" />
                          {formatRelative(t.lastMessageAt)}
                        </span>
                      </div>

                      <p className="mt-2 text-sm text-gray-700 line-clamp-2">
                        {t.lastMessageText || "No messages yet."}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className="text-xs text-gray-500">
                      {formatDateTime(t.lastMessageAt)}
                    </span>
                    <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-gray-500 transition" />
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const BusinessChatsPage = dynamic(() => Promise.resolve(BusinessChatsPageContent), {
  ssr: false,
});

export default BusinessChatsPage;
