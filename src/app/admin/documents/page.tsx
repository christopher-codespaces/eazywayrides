"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import {
  getFirestore,
  collection,
  query,
  orderBy,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { app } from "@/lib/firebase";

type DocType =
  | "id"
  | "drivers_license"
  | "proof_of_address"
  | "vehicle_registration";

const REQUIRED: { type: DocType; label: string }[] = [
  { type: "id", label: "ID / Passport" },
  { type: "drivers_license", label: "Driver's License" },
  { type: "proof_of_address", label: "Proof of Address" },
  { type: "vehicle_registration", label: "Vehicle Registration" },
];

type Status = "uploaded" | "approved" | "rejected" | string;

type DriverDocRow = {
  id: string; // firestore doc id
  uid: string;
  docType: DocType;
  fileName: string;
  fileType: string;
  fileSize: number;
  downloadURL: string;
  status: Status;
  createdAt?: Date | null;
};

type UserProfile = {
  uid: string;
  name?: string;
  email?: string;
  role?: string | null;
};

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes)) return "—";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(2)} MB`;
  const kb = bytes / 1024;
  return `${kb.toFixed(0)} KB`;
};

const formatDateTime = (d?: Date | null) => {
  if (!d) return "—";
  return d.toLocaleString();
};

export default function AdminDriverDocumentsPage() {
  const router = useRouter();

  const auth = useMemo(() => (app ? getAuth(app) : null), []);
  const db = useMemo(() => (app ? getFirestore(app) : null), []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [docs, setDocs] = useState<DriverDocRow[]>([]);
  const [usersByUid, setUsersByUid] = useState<Record<string, UserProfile>>({});

  const [actingOn, setActingOn] = useState<string | null>(null);

  // UI mode
  const [selectedDriverUid, setSelectedDriverUid] = useState<string | null>(
    null
  );

  const ensureAdmin = async (uid: string) => {
    if (!db) return false;
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists() && (snap.data() as any)?.role === "admin";
  };

  const loadAllDocs = async () => {
    if (!db) return;

    setLoading(true);
    setError(null);

    try {
      const q = query(
        collection(db, "driverDocuments"),
        orderBy("createdAt", "desc")
      );
      const snap = await getDocs(q);

      const list: DriverDocRow[] = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          uid: data.uid,
          docType: data.docType,
          fileName: data.fileName,
          fileType: data.fileType,
          fileSize: data.fileSize,
          downloadURL: data.downloadURL,
          status: data.status,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : null,
        };
      });

      setDocs(list);

      // Fetch user profiles for any uid we saw (name/email)
      const uids = Array.from(new Set(list.map((r) => r.uid))).slice(0, 500); // safety cap
      const pairs = await Promise.all(
        uids.map(async (uid) => {
          const us = await getDoc(doc(db, "users", uid));
          if (!us.exists()) return [uid, { uid }] as const;
          const d = us.data() as any;
          return [
            uid,
            {
              uid,
              name:
                (d.name as string) ||
                `${d.firstName || ""} ${d.lastName || ""}`.trim(),
              email: d.email as string,
              role: d.role as string,
            },
          ] as const;
        })
      );

      const map: Record<string, UserProfile> = {};
      for (const [uid, profile] of pairs) map[uid] = profile;
      setUsersByUid(map);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Failed to load documents.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!auth || !db) {
      setError(
        "Firebase is not configured. Missing NEXT_PUBLIC_FIREBASE_* env vars."
      );
      setLoading(false);
      return;
    }

    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.push("/login");
        return;
      }

      const ok = await ensureAdmin(u.uid);
      if (!ok) {
        router.push("/");
        return;
      }

      await loadAllDocs();
    });

    return () => unsub();
  }, [auth, db, router]);

  // group all docs by driver uid (for completeness)
  const grouped = useMemo(() => {
    const map = new Map<string, DriverDocRow[]>();
    for (const r of docs) {
      const arr = map.get(r.uid) ?? [];
      arr.push(r);
      map.set(r.uid, arr);
    }

    // For each driver, compute latest doc per type (latest = first in time-sorted list)
    return Array.from(map.entries()).map(([uid, list]) => {
      const latest: Partial<Record<DocType, DriverDocRow>> = {};
      for (const row of list) {
        if (!latest[row.docType]) latest[row.docType] = row;
      }

      const statusOf = (row?: DriverDocRow) =>
        (row?.status || "uploaded").toLowerCase();

      const submittedCount = REQUIRED.reduce(
        (acc, req) => acc + (latest[req.type] ? 1 : 0),
        0
      );

      const approvedCount = REQUIRED.reduce(
        (acc, req) => acc + (statusOf(latest[req.type]) === "approved" ? 1 : 0),
        0
      );

      return { uid, list, latest, submittedCount, approvedCount };
    });
  }, [docs]);

  // Pending docs list (only those needing action)
  const pending = useMemo(
    () => docs.filter((d) => ((d.status || "uploaded") as string) === "uploaded"),
    [docs]
  );

  const setStatus = async (docId: string, status: "approved" | "rejected") => {
    if (!db) return;
    setActingOn(docId);
    setError(null);

    try {
      await updateDoc(doc(db, "driverDocuments", docId), {
        status,
        reviewedAt: serverTimestamp(), // optional field, admin-only
      });
      await loadAllDocs();
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Failed to update status.");
    } finally {
      setActingOn(null);
    }
  };

  const displayName = (uid: string) =>
    usersByUid[uid]?.name || usersByUid[uid]?.email || uid;

  const driverView = selectedDriverUid
    ? grouped.find((g) => g.uid === selectedDriverUid)
    : null;

  return (
    <div className="p-4 md:p-6 max-w-6xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold">
            Driver Documents
          </h1>
          <p className="text-sm text-gray-600">
            Review uploads and browse documents by driver.
          </p>
        </div>

        <button
          onClick={() => router.push("/admin")}
          className="px-3 py-2 rounded-lg border text-sm hover:bg-gray-50"
        >
          Back
        </button>
      </div>

      {loading && (
        <div className="bg-white rounded-lg shadow border p-4 text-sm text-gray-600">
          Loading…
        </div>
      )}

      {error && !loading && (
        <div className="bg-white rounded-lg shadow border p-4 text-sm text-red-600">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left: All drivers */}
          <div className="bg-white rounded-lg shadow border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">All Drivers</h2>
              {selectedDriverUid && (
                <button
                  onClick={() => setSelectedDriverUid(null)}
                  className="text-sm text-gray-600 hover:underline"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="space-y-2 max-h-[65vh] overflow-auto pr-1">
              {grouped
                .slice()
                .sort((a, b) => b.approvedCount - a.approvedCount)
                .map((g) => (
                  <button
                    key={g.uid}
                    onClick={() => setSelectedDriverUid(g.uid)}
                    className={`w-full text-left border rounded-lg p-3 hover:bg-gray-50 ${
                      selectedDriverUid === g.uid
                        ? "border-blue-600 bg-blue-50"
                        : ""
                    }`}
                  >
                    <div className="font-medium break-all">
                      {displayName(g.uid)}
                    </div>
                    <div className="text-xs text-gray-600">
                      {g.approvedCount}/{REQUIRED.length} approved
                      <span className="text-gray-400">
                        {" "}
                        • {g.submittedCount}/{REQUIRED.length} submitted
                      </span>
                    </div>
                  </button>
                ))}
              {grouped.length === 0 && (
                <div className="text-sm text-gray-600">
                  No driver documents yet.
                </div>
              )}
            </div>
          </div>

          {/* Middle/Right: Driver details OR pending review */}
          <div className="lg:col-span-2 space-y-4">
            {/* Pending review section */}
            <div className="bg-white rounded-lg shadow border p-4 space-y-3">
              <h2 className="text-lg font-semibold">Pending Review</h2>

              {pending.length === 0 ? (
                <div className="text-sm text-gray-600">Nothing pending.</div>
              ) : (
                <div className="space-y-3">
                  {pending.slice(0, 50).map((d) => (
                    <div key={d.id} className="border rounded-lg p-3 bg-gray-50">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="text-sm font-medium">
                            {displayName(d.uid)} • {d.docType}
                          </div>
                          <div className="text-xs text-gray-600">
                            {d.fileName} • {formatBytes(d.fileSize)} • Uploaded:{" "}
                            {formatDateTime(d.createdAt)}
                          </div>
                        </div>

                        <a
                          href={d.downloadURL}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-blue-600 hover:underline"
                        >
                          View
                        </a>
                      </div>

                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => setStatus(d.id, "approved")}
                          disabled={actingOn === d.id}
                          className="px-3 py-2 rounded-lg bg-green-600 text-white text-sm hover:bg-green-700 disabled:bg-gray-400"
                        >
                          {actingOn === d.id ? "Working..." : "Approve"}
                        </button>
                        <button
                          onClick={() => setStatus(d.id, "rejected")}
                          disabled={actingOn === d.id}
                          className="px-3 py-2 rounded-lg bg-rose-600 text-white text-sm hover:bg-rose-700 disabled:bg-gray-400"
                        >
                          {actingOn === d.id ? "Working..." : "Reject"}
                        </button>
                      </div>
                    </div>
                  ))}
                  {pending.length > 50 && (
                    <div className="text-xs text-gray-500">
                      Showing first 50 pending items.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Driver detail section */}
            <div className="bg-white rounded-lg shadow border p-4 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Driver Documents</h2>
                  <p className="text-sm text-gray-600">
                    {selectedDriverUid
                      ? `Viewing: ${displayName(selectedDriverUid)}`
                      : "Select a driver from the left to view their documents."}
                  </p>
                </div>
              </div>

              {!selectedDriverUid && (
                <div className="text-sm text-gray-600">No driver selected.</div>
              )}

              {selectedDriverUid && driverView && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {REQUIRED.map((req) => {
                    const row = driverView.latest[req.type];
                    const missing = !row;

                    return (
                      <div
                        key={req.type}
                        className="border rounded-lg p-3 bg-gray-50"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-medium">{req.label}</div>
                            {missing ? (
                              <div className="text-sm text-amber-700 mt-1">
                                Missing
                              </div>
                            ) : (
                              <div className="text-xs text-gray-600 mt-1 space-y-1">
                                <div>
                                  {row.fileName} • {formatBytes(row.fileSize)}
                                </div>
                                <div>
                                  Uploaded: {formatDateTime(row.createdAt)} •
                                  Status:{" "}
                                  <span className="font-semibold">
                                    {(row.status || "uploaded").toUpperCase()}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>

                          {!missing && row ? (
                            <a
                              href={row.downloadURL}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm text-blue-600 hover:underline"
                            >
                              View
                            </a>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
