"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
  type User,
} from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { initFirebaseClient } from "@/lib/firebaseClient";

type Role = "driver" | "business" | "admin";

interface UserData {
  email: string;
  role: Role;
  name?: string;
  businessName?: string;
  phone?: string;
  credits?: number;
}

interface AuthContextType {
  user: User | null;
  userData: UserData | null;
  role: Role | null;
  setRole: (role: Role | null) => void;
  loading: boolean;
  /** True once Firebase auth state has been checked at least once */
  initialized: boolean;
  logout: () => Promise<void>;
  refreshUserData: () => Promise<void>;
}

// ─── Safe localStorage wrapper ────────────────────────────────────────────────
// localStorage is unavailable in SSR and blocked in sandboxed iframe
// environments (Vercel preview, some browsers). All reads/writes MUST go
// through these helpers to avoid a silent crash that prevents AuthProvider
// from ever mounting — which causes initialized to stay false forever and
// leaves the login page spinning indefinitely.
const safeStorage = {
  get(key: string): string | null {
    try {
      if (typeof window === "undefined") return null;
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(key, value);
    } catch {
      // silently ignore — in-memory state in React is the source of truth
    }
  },
  remove(key: string): void {
    try {
      if (typeof window === "undefined") return;
      window.localStorage.removeItem(key);
    } catch {
      // silently ignore
    }
  },
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [role, setRole] = useState<Role | null>(() => {
    // Safe read — will not throw even if localStorage is blocked
    const stored = safeStorage.get("role");
    if (stored === "driver" || stored === "business" || stored === "admin") {
      return stored;
    }
    return null;
  });

  const router = useRouter();

  // ─── Logout ──────────────────────────────────────────────────────────────
  const logout = async () => {
    try {
      await fetch("/api/session/logout", { method: "POST" });
    } catch (err) {
      console.error("[AuthContext] Failed to clear server session:", err);
    }

    try {
      const app = initFirebaseClient();
      if (app) {
        const auth = getAuth(app);
        await signOut(auth);
      }
    } catch (err) {
      console.error("[AuthContext] Firebase signOut error:", err);
    }

    setUser(null);
    setUserData(null);
    setRole(null);
    safeStorage.remove("role");
    router.push("/login");
  };

  // ─── Refresh user data from Firestore ────────────────────────────────────
  const refreshUserData = async () => {
    const app = initFirebaseClient();
    if (!user || !app) return;

    try {
      const db = getFirestore(app);
      const ref = doc(db, "users", user.uid);
      const snap = await getDoc(ref);

      if (snap.exists()) {
        const data = snap.data() as UserData;
        setUserData(data);
        setRole(data.role ?? null);
      }
    } catch (err) {
      console.error("[AuthContext] Error refreshing user data:", err);
    }
  };

  // ─── Auth state listener ──────────────────────────────────────────────────
  useEffect(() => {
    const app = initFirebaseClient();
    if (!app) {
      setLoading(false);
      setInitialized(true);
      return;
    }

    const auth = getAuth(app);
    const db = getFirestore(app);

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      if (currentUser) {
        const ref = doc(db, "users", currentUser.uid);
        const snap = await getDoc(ref);

        if (snap.exists()) {
          const data = snap.data() as UserData;
          setUserData(data);
          if (data.role) {
            setRole(data.role);
            safeStorage.set("role", data.role);
          }
        } else {
          setUserData(null);
        }
      } else {
        setUserData(null);
        setRole(null);
        safeStorage.remove("role");
      }

      setLoading(false);
      setInitialized(true);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        userData,
        role,
        setRole,
        loading,
        initialized,
        logout,
        refreshUserData,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
