"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { onAuthStateChanged, getAuth, signOut, type User } from "firebase/auth";
import { initFirebaseClient } from "@/lib/firebaseClient";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";

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

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [role, setRole] = useState<Role | null>(() => {
    if (typeof window === "undefined") return null;
    const stored = localStorage.getItem("role");
    if (stored === "driver" || stored === "business" || stored === "admin") {
      return stored;
    }
    return null;
  });

  const router = useRouter();

  // ─── Logout ──────────────────────────────────────────────────────────────
  // Calls the server-side API route first so the httpOnly __session cookie is
  // cleared before the client-side Firebase signOut. This ensures middleware
  // immediately reflects the signed-out state on the very next request.
  const logout = async () => {
    // 1. Clear httpOnly server session cookie
    try {
      await fetch("/api/session/logout", { method: "POST" });
    } catch (err) {
      console.error("[AuthContext] Failed to clear server session:", err);
    }

    // 2. Sign out Firebase client auth
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
    if (typeof window !== "undefined") localStorage.removeItem("role");
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
            if (typeof window !== "undefined") localStorage.setItem("role", data.role);
          }
        } else {
          setUserData(null);
        }
      } else {
        setUserData(null);
        setRole(null);
        if (typeof window !== "undefined") localStorage.removeItem("role");
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
