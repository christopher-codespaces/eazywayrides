"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getFirestore,
  collection,
  query,
  orderBy,
  getDocs,
} from "firebase/firestore";
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
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
};

const roleLabel = (role?: Role | null) => {
  if (role === "driver") return "Driver";
  if (role === "business") return "Business";
  if (role === "admin") return "Admin";
  return "—";
};

const roleChip = (role?: Role | null) => {
  if (role === "driver")
    return "bg-blue-100 text-blue-900 ring-blue-200 dark:bg-blue-950 dark:text-blue-100 dark:ring-blue-900/60";
  if (role === "business")
    return "bg-amber-100 text-amber-900 ring-amber-200 dark:bg-amber-950 dark:text-amber-100 dark:ring-amber-900/60";
  if (role === "admin")
    return "bg-purple-100 text-purple-900 ring-purple-200 dark:bg-purple-950 dark:text-purple-100 dark:ring-purple-900/60";
  return "bg-zinc-100 text-zinc-900 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700";
};

const statusChip = (isActive: boolean) =>
  isActive
    ? "bg-emerald-100 text-emerald-900 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-100 dark:ring-emerald-900/60"
    : "bg-zinc-100 text-zinc-900 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700";

export default function ActiveUsersPage() {
  /**
   * Firestore client (client SDK)
   * ---------------------------------------------------------------------------
   * Initialise only when `app` exists to avoid crashes when env vars are missing.
   */
  const db = useMemo(() => (app ? getFirestore(app) : null), []);

  const [activeWindowMinutes, setActiveWindowMinutes] = useState(60);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUsers = async () => {
      if (!db) {
        setError(
          "Firebase is not configured. Missing NEXT_PUBLIC_FIREBASE_* env vars."
        );
        setLoading(false);
        return;
      }

      try {
        setError(null);
        setLoading(true);

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

  const activeCutoffMs = useMemo(
    () => Date.now() - activeWindowMinutes * 60 * 1000,
    [activeWindowMinutes]
  );

  const displayUsers = useMemo(
    () => users.filter((u) => u.role !== "admin"),
    [users]
  );

  const activeUsers = useMemo(() => {
    return displayUsers.filter((u) => {
      const t = u.lastLoginAt?.getTime();
      return typeof t === "number" && t >= activeCutoffMs;
    });
  }, [displayUsers, activeCutoffMs]);

  const counts = useMemo(() => {
    const total = displayUsers.length;
    const active = activeUsers.length;

    let activeDrivers = 0;
    let activeBusinesses = 0;

    for (const u of activeUsers) {
      if (u.role === "driver") activeDrivers++;
      if (u.role === "business") activeBusinesses++;
    }

    return { total, active, activeDrivers, activeBusinesses };
  }, [displayUsers.length, activeUsers]);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Active Users
            </h1>
            <p className="text-base text-zinc-700 dark:text-zinc-300">
              Users are sorted by <span className="font-semibold">lastLoginAt</span>.
              “Active” is based on the selected window.
            </p>
          </div>

          {/* Control */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label
              htmlFor="activeWindow"
              className="text-base font-semibold text-zinc-800 dark:text-zinc-200"
            >
              Active window
            </label>

            <select
              id="activeWindow"
              className="h-12 w-full min-w-[240px] rounded-xl border border-zinc-300 bg-white px-4 text-base font-semibold text-zinc-950 shadow-sm outline-none transition focus:border-zinc-400 focus:ring-4 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-zinc-500 dark:focus:ring-zinc-800"
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="text-base font-medium text-zinc-700 dark:text-zinc-300">
              Total Accounts
            </div>
            <div className="mt-2 text-3xl font-extrabold">{counts.total}</div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="text-base font-medium text-zinc-700 dark:text-zinc-300">
              Active Users
            </div>
            <div className="mt-2 text-3xl font-extrabold">{counts.active}</div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="text-base font-medium text-zinc-700 dark:text-zinc-300">
              Active Drivers
            </div>
            <div className="mt-2 text-3xl font-extrabold">
              {counts.activeDrivers}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="text-base font-medium text-zinc-700 dark:text-zinc-300">
              Active Businesses
            </div>
            <div className="mt-2 text-3xl font-extrabold">
              {counts.activeBusinesses}
            </div>
          </div>
        </div>

        {/* Loading / Error */}
        {loading && (
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-base text-zinc-700 dark:text-zinc-300">
              Loading users…
            </p>
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm dark:border-red-900/50 dark:bg-red-950/40">
            <p className="text-base font-semibold text-red-700 dark:text-red-200">
              {error}
            </p>
          </div>
        )}

        {/* Results */}
        {!loading && !error && (
          <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950 overflow-hidden">
            <div className="flex flex-col gap-2 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-semibold">Most recently active</h2>
              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                Showing <span className="font-semibold">{displayUsers.length}</span>{" "}
                users
              </p>
            </div>

            {/* Mobile list */}
            <div className="block sm:hidden">
              <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {displayUsers.map((u) => {
                  const t = u.lastLoginAt?.getTime();
                  const isActive = typeof t === "number" && t >= activeCutoffMs;

                  const displayName =
                    u.role === "business"
                      ? u.businessName || "—"
                      : u.name || "—";

                  return (
                    <li key={u.id} className="p-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-bold ring-1 ${roleChip(
                            u.role
                          )}`}
                        >
                          {roleLabel(u.role)}
                        </span>

                        <span
                          className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-extrabold ring-1 ${statusChip(
                            isActive
                          )}`}
                        >
                          {isActive ? "ACTIVE" : "INACTIVE"}
                        </span>
                      </div>

                      <div className="mt-3 text-lg font-extrabold leading-snug">
                        {displayName}
                      </div>

                      <div className="mt-1 break-words text-base text-zinc-700 dark:text-zinc-300">
                        {u.email ?? "—"}
                      </div>

                      <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                        Last active:{" "}
                        <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                          {formatDateTime(u.lastLoginAt)}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Desktop table */}
            <div className="hidden sm:block">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-zinc-50 text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
                    <tr>
                      <th className="p-4 text-sm font-extrabold uppercase tracking-wide">
                        Role
                      </th>
                      <th className="p-4 text-sm font-extrabold uppercase tracking-wide">
                        Name
                      </th>
                      <th className="p-4 text-sm font-extrabold uppercase tracking-wide">
                        Email
                      </th>
                      <th className="p-4 text-sm font-extrabold uppercase tracking-wide">
                        Last Active
                      </th>
                      <th className="p-4 text-sm font-extrabold uppercase tracking-wide">
                        Status
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {displayUsers.map((u) => {
                      const t = u.lastLoginAt?.getTime();
                      const isActive = typeof t === "number" && t >= activeCutoffMs;

                      const displayName =
                        u.role === "business"
                          ? u.businessName || "—"
                          : u.name || "—";

                      return (
                        <tr
                          key={u.id}
                          className="bg-white hover:bg-zinc-50 dark:bg-zinc-950 dark:hover:bg-zinc-900/40"
                        >
                          <td className="p-4">
                            <span
                              className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-bold ring-1 ${roleChip(
                                u.role
                              )}`}
                            >
                              {roleLabel(u.role)}
                            </span>
                          </td>

                          <td className="p-4 text-base font-semibold">
                            {displayName}
                          </td>

                          <td className="p-4 text-base text-zinc-800 dark:text-zinc-200">
                            {u.email ?? "—"}
                          </td>

                          <td className="p-4 text-base text-zinc-800 dark:text-zinc-200">
                            {formatDateTime(u.lastLoginAt)}
                          </td>

                          <td className="p-4">
                            <span
                              className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-extrabold ring-1 ${statusChip(
                                isActive
                              )}`}
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
            </div>

            <div className="border-t border-zinc-200 px-5 py-4 text-sm text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
              Note: “Active” is computed client-side using your selected time window.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}