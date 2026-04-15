"use client";

/**
 * Firebase Authentication Hook
 * =============================================================================
 * Provides auth state, loading status, and user data with proper initialization.
 *
 * Key features:
 * - Waits for Firebase to initialize before checking auth
 * - Uses onAuthStateChanged for reliable auth state detection
 * - Handles Google redirect results BEFORE auth state changes
 * - Prevents premature redirects by checking redirect result first
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  ReactNode,
} from "react";
import {
  onAuthStateChanged,
  getAuth,
  getRedirectResult,
  type User,
  type Auth,
} from "firebase/auth";
import { getFirestore, doc, getDoc, type Firestore } from "firebase/firestore";
import { initFirebaseClient } from "@/lib/firebaseClient";

type Role = "driver" | "business" | "admin" | null;

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
  role: Role;
  setRole: (role: Role) => void;
  loading: boolean;
  initialized: boolean;
  logout: () => Promise<void>;
  refreshUserData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [auth, setAuth] = useState<Auth | null>(null);
  const [db, setDb] = useState<Firestore | null>(null);

  // Track if we've checked redirect result to avoid race conditions
  const redirectCheckedRef = useRef(false);

  // Initialize Firebase and handle auth state
  useEffect(() => {
    const firebaseApp = initFirebaseClient();
    if (!firebaseApp) {
      setLoading(false);
      setInitialized(true);
      return;
    }

    const authInstance = getAuth(firebaseApp);
    const dbInstance = getFirestore(firebaseApp);

    setAuth(authInstance);
    setDb(dbInstance);

    let unsubscribe: (() => void) | null = null;

    // CRITICAL: Check redirect result BEFORE setting up auth listener
    // This prevents onAuthStateChanged (which fires with null first) from
    // causing premature redirects
    const checkRedirectAndInitAuth = async () => {
      try {
        // Check if this was a redirect login (Google)
        const result = await getRedirectResult(authInstance);

        redirectCheckedRef.current = true;

        if (result?.user) {
          // User just logged in via redirect - process immediately
          console.log("[useAuth] Redirect login detected:", result.user.email);
          await processUserData(result.user, dbInstance, authInstance);
          setInitialized(true);
          setLoading(false);
          return;
        }

        // No redirect result - set up normal auth listener
        unsubscribe = onAuthStateChanged(authInstance, async (currentUser) => {
          await processUserData(currentUser, dbInstance, authInstance);
          setLoading(false);
          setInitialized(true);
        });
      } catch (err) {
        console.error("[useAuth] Redirect result error:", err);
        // Still set up auth listener even if redirect check fails
        unsubscribe = onAuthStateChanged(authInstance, async (currentUser) => {
          await processUserData(currentUser, dbInstance, authInstance);
          setLoading(false);
          setInitialized(true);
        });
      }
    };

    const processUserData = async (
      currentUser: User | null,
      dbInstance: Firestore,
      authInstance: Auth
    ) => {
      setUser(currentUser);

      if (currentUser) {
        // Set session cookie for middleware
        document.cookie = `__session=${currentUser.uid}; path=/; max-age=${60 * 60 * 24 * 14}; SameSite=Lax`;

        // Fetch user data from Firestore
        try {
          const ref = doc(dbInstance, "users", currentUser.uid);
          const snap = await getDoc(ref);

          if (snap.exists()) {
            const data = snap.data() as UserData;
            setUserData(data);
            setRole(data.role ?? null);
          } else {
            setUserData(null);
            setRole(null);
          }
        } catch (err) {
          console.error("[useAuth] Error fetching user data:", err);
          setUserData(null);
          setRole(null);
        }
      } else {
        // Clear session cookie on sign out
        document.cookie = "__session=; path=/; max-age=0; SameSite=Lax";
        setUserData(null);
        setRole(null);
      }
    };

    checkRedirectAndInitAuth();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  const refreshUserData = async () => {
    if (!user || !db) return;

    try {
      const ref = doc(db, "users", user.uid);
      const snap = await getDoc(ref);

      if (snap.exists()) {
        const data = snap.data() as UserData;
        setUserData(data);
        setRole(data.role ?? null);
      }
    } catch (err) {
      console.error("[useAuth] Error refreshing user data:", err);
    }
  };

  const logout = async () => {
    if (!auth) return;

    try {
      await auth.signOut();
    } catch (err) {
      console.error("[useAuth] Logout error:", err);
    }

    // Clear session cookie
    document.cookie = "__session=; path=/; max-age=0; SameSite=Lax";

    setUser(null);
    setUserData(null);
    setRole(null);
  };

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
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
};
