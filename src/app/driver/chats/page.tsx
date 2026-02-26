"use client";

import { useEffect, useState } from "react";
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
import { MessageSquare, Briefcase, Clock } from "lucide-react";

type ThreadRow = {
  id: string;
  jobId: string;
  jobTitle?: string;
  businessId: string;
  driverId: string;
  driverName?: string;
  lastMessageText?: string;
  lastMessageAt?: Date | null;
};

const formatDateTime = (d?: Date | null) => {
  if (!d) return "—";
  return d.toLocaleString();
};

export default function DriverChatsPage() {
  const router = useRouter();
  const auth = getAuth(app);
  const db = getFirestore(app);

  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const threadsRef = collection(db, "threads");
        const q = query(
          threadsRef,
          where("driverId", "==", user.uid),
          orderBy("lastMessageAt", "desc"),
        );

        const snap = await getDocs(q);

        const list: ThreadRow[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            jobId: data.jobId,
            jobTitle: data.jobTitle,
            businessId: data.businessId,
            driverId: data.driverId,
            driverName: data.driverName,
            lastMessageText: data.lastMessageText,
            lastMessageAt: data.lastMessageAt?.toDate
              ? data.lastMessageAt.toDate()
              : null,
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b bg-white">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-600">
              <MessageSquare size={20} />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Chats</h1>
              <p className="text-sm text-gray-600">
                Conversations with businesses for each job application
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {loading && (
          <div className="rounded-xl border bg-white p-6 text-sm text-gray-600 animate-pulse">
            Loading conversations…
          </div>
        )}

        {error && !loading && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && threads.length === 0 && (
          <div className="rounded-2xl border bg-white p-10 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-orange-100 text-orange-600">
              <MessageSquare />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-gray-900">
              No chats yet
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              A business will start a conversation once they review your job
              application.
            </p>
          </div>
        )}

        {!loading && !error && threads.length > 0 && (
          <div className="space-y-3">
            {threads.map((t) => (
              <div
                key={t.id}
                className="rounded-2xl border bg-white p-5 shadow-sm hover:shadow-md transition">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                      <Briefcase size={16} className="text-orange-600" />
                      <span className="truncate">
                        {t.jobTitle ? t.jobTitle : `Job ${t.jobId}`}
                      </span>
                    </div>

                    <p className="text-sm text-gray-700 line-clamp-1">
                      {t.lastMessageText || "No messages yet."}
                    </p>

                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <Clock size={12} />
                      {formatDateTime(t.lastMessageAt)}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 shrink-0">
                    <button
                      onClick={() => router.push(`/driver/chats/${t.id}`)}
                      className="px-4 py-2 rounded-xl bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 transition">
                      Open chat
                    </button>

                    <button
                      onClick={() => router.push(`/driver/jobs/${t.jobId}`)}
                      className="px-4 py-2 rounded-xl border text-sm font-medium hover:bg-gray-50 transition">
                      View job
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
