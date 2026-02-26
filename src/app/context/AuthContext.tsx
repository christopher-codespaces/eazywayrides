"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";
import { onAuthStateChanged, getAuth, signOut, User } from "firebase/auth";
import { app } from "@/lib/firebase";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";

type Role = "driver" | "business" | "admin";

// Extra user info pulled from Firestore (users/{uid})
interface UserData {
  email: string;
  role: Role;
  name?: string;
  businessName?: string;
}

// What the rest of the app can access from useAuth()
interface AuthContextType {
  user: User | null; // Firebase auth user
  userData: UserData | null; // Firestore profile doc (if it exists)
  role: Role | null; // cached role for quick UI routing
  setRole: (role: Role | null) => void; // allow login/onboarding pages to update role
  loading: boolean; // true while auth state is being resolved
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  /**
   * Firebase client dependencies (Auth + Firestore)
   * ---------------------------------------------------------------------------
   * The Firebase client `app` may be `null` when NEXT_PUBLIC_FIREBASE_* environment
   * variables are not configured (e.g. local development, CI, or review builds).
   *
   * To prevent runtime crashes and TypeScript errors:
   * - Auth and Firestore are initialised only when `app` exists
   * - Otherwise both remain null and the provider renders in a "disabled" state
   *
   * When environment variables are provided:
   * - `app` becomes available
   * - Auth/Firestore initialises normally
   * - No behaviour change from the original implementation
   */
  const auth = useMemo(() => (app ? getAuth(app) : null), [app]);
  const db = useMemo(() => (app ? getFirestore(app) : null), [app]);
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);

  // Seed role from localStorage so sidebar/navbar can render correctly on refresh.
  // (Still gets corrected by Firestore once onAuthStateChanged runs.)
  const [role, setRole] = useState<Role | null>(() => {
    if (typeof window === "undefined") return null;
    const stored = localStorage.getItem("role");
    if (stored === "driver" || stored === "business" || stored === "admin") {
      return stored;
    }
    return null;
  });

  // Blocks protected pages/components until we know the auth state
  const [loading, setLoading] = useState(true);

  /**
   * Central logout
   * ---------------------------------------------------------------------------
   * Guard behaviour:
   * - If Firebase Auth is not available (missing client env vars),
   *   do a local-only logout (clear state + redirect) instead of throwing.
   */
  const logout = async () => {
    // Guard: Firebase client not configured
    if (!auth) {
      setUser(null);
      setUserData(null);
      setRole(null);
      if (typeof window !== "undefined") localStorage.removeItem("role");
      router.push("/login");
      return;
    }

    await signOut(auth);

    // Clear all auth/profile state
    setUser(null);
    setUserData(null);
    setRole(null);

    // Keep localStorage in sync with context
    localStorage.removeItem("role");

    router.push("/login");
  };

  useEffect(() => {
    /**
     * Auth subscription
     * -------------------------------------------------------------------------
     * - Watches Firebase session changes (login/logout/refresh)
     * - Fetches users/{uid} profile doc to populate role/name/etc.
     *
     * Guard behaviour:
     * - If Auth/Firestore are not configured, exit early and unblock the UI
     *   with a clear missing-config state (no throw / no crash).
     */
    if (!auth || !db) {
      setUser(null);
      setUserData(null);
      setRole(null);
      if (typeof window !== "undefined") localStorage.removeItem("role");
      setLoading(false);
      return;
    }

    // Listen for Firebase auth session changes (login/logout/refresh)
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      if (currentUser) {
        // Pull Firestore profile (role/name/etc)
        const ref = doc(db, "users", currentUser.uid);
        const snap = await getDoc(ref);

        if (snap.exists()) {
          const data = snap.data() as UserData;
          setUserData(data);

          // Role is used all over the UI, so keep context + localStorage in sync
          if (data.role) {
            setRole(data.role);
            if (typeof window !== "undefined") localStorage.setItem("role", data.role);
          }

        } else {
          // Auth exists but no profile doc yet (usually means onboarding)
          setUserData(null);
        }
      } else {
        // Fully logged out
        setUserData(null);
        setRole(null);
        if (typeof window !== "undefined") localStorage.removeItem("role");
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, [auth, db]);

  return (
    <AuthContext.Provider
      value={{
        user,
        userData,
        role,
        setRole,
        loading,
        logout,
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
