"use client";

import { useEffect, useMemo, useState } from "react";
import { getFirestore, collection, query, orderBy, getDocs } from "firebase/firestore";
import { app } from "@/lib/firebase";

type Role = "driver" | "business" | "admin";

type UserRow = {
  id: string;
  email?: string;
  role?: Role | null;
  name?: string;
  businessName?: string;
  lastLoginAt?: Date | null;
};

const formatDateTime = (d?: Date | null) => {
  if (!d) return "—";
  return d.toLocaleString();
};

export default function ActiveUsersPage() {
  /**
   * Firestore client (client SDK)
   * ---------------------------------------------------------------------------
   * The Firebase client app may be `null` when NEXT_PUBLIC_FIREBASE_* environment
   * variables are not configured (e.g. local development, CI, or review builds).
   *
   * To prevent build-time or prerender crashes:
   * - Firestore is initialised only when `app` exists
   * - Otherwise `db` remains null and the UI handles the missing configuration
   *
   * When environment variables are provided:
   * - `app` becomes available
   * - Firestore initialises normally
   * - No behaviour change from the original implementation
   */
  const db = useMemo(() => (app ? getFirestore(app) : null), [app]);


  // Change this to define "active"
  // Example: 15 minutes, 1 hour, 24 hours, 7 days, etc.
  const [activeWindowMinutes, setActiveWindowMinutes] = useState(60);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Data loading
   * ---------------------------------------------------------------------------
   * If Firestore is not available (missing client env vars), the fetch exits
   * early with a clear error message instead of throwing or crashing the build.
   */  
  useEffect(() => {
    const fetchUsers = async () => {

      // Guard: Firebase client not configured
      if (!db) {
        setError("Firebase is not configured. Missing NEXT_PUBLIC_FIREBASE_* env vars.");
        setLoading(false);
        return;
      }

      try {
        setError(null);
        setLoading(true);

        // Pull users sorted by most recently active
        const usersRef = collection(db, "users");
        const q = query(usersRef, orderBy("lastLoginAt", "desc"));

        const snap = await getDocs(q);

        const rows: UserRow[] = snap.docs.map((docSnap) => {
          const data = docSnap.data() as any;
          return {
            id: docSnap.id,
            email: data.email,
            role: data.role ?? null,
            name: data.name ?? "",
            businessName: data.businessName ?? "",
            lastLoginAt: data.lastLoginAt?.toDate ? data.lastLoginAt.toDate() : null,
          };
        });

        setUsers(rows);
      } catch (e: any) {
        console.error(e);
        setError(e?.message || "Failed to load users.");
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, [db]);

  //const now = Date.now();
  const activeCutoffMs = useMemo(() => {
    return Date.now() - activeWindowMinutes * 60 * 1000;
  }, [activeWindowMinutes]);


  const displayUsers = useMemo(()=> {
    return users.filter((u) => u.role !== "admin");
  }, [users]);

  const activeUsers = useMemo(() => {
    return displayUsers.filter((u) => {
      //if (u.role ==="admin") return false;

      const t = u.lastLoginAt?.getTime();
      return typeof t === "number" && t >= activeCutoffMs;
    });
  }, [displayUsers, activeCutoffMs]);

  

  const counts = useMemo(() => {
    const total = displayUsers.length;

    let active = activeUsers.length;
    let activeDrivers = 0;
    let activeBusinesses = 0;

    for (const u of activeUsers) {
     
      if (u.role === "driver") activeDrivers++;
      if (u.role === "business") activeBusinesses++;
    }

    return { total, active, activeDrivers, activeBusinesses };
  }, [displayUsers.length, activeUsers]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Active Users</h1>
          {/* <p className="text-sm text-gray-600">
            “Active” is based on <code className="px-1 py-0.5 bg-gray-100 rounded">users.lastLoginAt</code>.
          </p> */}
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-700">Active window</label>
          <select
            className="border rounded-lg px-3 py-2 text-sm"
            value={activeWindowMinutes}
            onChange={(e) => setActiveWindowMinutes(Number(e.target.value))}
          >
            <option value={15}>Last 15 minutes</option>
            <option value={60}>Last 1 hour</option>
            <option value={60 * 24}>Last 24 hours</option>
            <option value={60 * 24 * 7}>Last 7 days</option>
            <option value={60 * 24 * 30}>Last 30 days</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="p-4 bg-white rounded-lg shadow border">
          <div className="text-sm text-gray-600">Total Accounts</div>
          <div className="text-2xl font-bold">{counts.total}</div>
        </div>

        <div className="p-4 bg-white rounded-lg shadow border">
          <div className="text-sm text-gray-600">Active Users</div>
          <div className="text-2xl font-bold">{counts.active}</div>
        </div>

        <div className="p-4 bg-white rounded-lg shadow border">
          <div className="text-sm text-gray-600">Active Drivers</div>
          <div className="text-2xl font-bold">{counts.activeDrivers}</div>
        </div>

        <div className="p-4 bg-white rounded-lg shadow border">
          <div className="text-sm text-gray-600">Active Businesses</div>
          <div className="text-2xl font-bold">{counts.activeBusinesses}</div>
        </div>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading users...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && (
        <div className="bg-white rounded-lg shadow border overflow-hidden">
          <div className="px-4 py-3 border-b">
            <h2 className="font-semibold">Most recently active</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-700">
                <tr>
                  <th className="text-left p-3">Role</th>
                  <th className="text-left p-3">Name</th>
                  <th className="text-left p-3">Email</th>
                  <th className="text-left p-3">Last Active</th>
                  <th className="text-left p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {displayUsers.map((u) => {
                  const t = u.lastLoginAt?.getTime();
                  const isActive = typeof t === "number" && t >= activeCutoffMs;

                  const displayName =
                    u.role === "business"
                      ? u.businessName || "—"
                      : u.name || "—";

                  return (
                    <tr key={u.id} className="border-t">
                      <td className="p-3">{u.role ?? "—"}</td>
                      <td className="p-3">{displayName}</td>
                      <td className="p-3">{u.email ?? "—"}</td>
                      <td className="p-3">{formatDateTime(u.lastLoginAt)}</td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-1 rounded-full text-xs ${
                            isActive
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-200 text-gray-700"
                          }`}
                        >
                          {isActive ? "ACTIVE" : "INACTIVE"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 border-t text-xs text-gray-500">
            Note: “Active” is computed client-side using your selected time window.
          </div>
        </div>
      )}
    </div>
  );
}
