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
}

interface AuthContextType {
  user: User | null;
  userData: UserData | null;
  role: Role | null;
  setRole: (role: Role | null) => void;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<Role | null>(() => {
    if (typeof window === "undefined") return null;
    const stored = localStorage.getItem("role");
    if (stored === "driver" || stored === "business" || stored === "admin") {
      return stored;
    }
    return null;
  });

  const router = useRouter();

  const logout = async () => {
    setUser(null);
    setUserData(null);
    setRole(null);
    if (typeof window !== "undefined") localStorage.removeItem("role");
    router.push("/login");
    return;
  };

  useEffect(() => {
    const app = initFirebaseClient();
    if (!app) {
      setLoading(false);
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