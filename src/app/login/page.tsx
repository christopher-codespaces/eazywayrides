"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  type Auth,
} from "firebase/auth";
import { initFirebaseClient, getFirebaseAuth } from "@/lib/firebaseClient";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  type Firestore,
} from "firebase/firestore";
import { useAuth } from "@/app/context/AuthContext";

const ONBOARDING_ROUTE = "/complete-signup";

// Keep roles tight/explicit since routing + UI depends on this
type Role = "driver" | "business" | "admin";

export default function LoginPage() {
  // Firebase dependencies - initialized locally to ensure they're ready
  const [auth, setAuth] = useState<Auth | null>(null);
  const [db, setDb] = useState<Firestore | null>(null);
  const [firebaseReady, setFirebaseReady] = useState(false);

  const router = useRouter();

  // Role lives in context so Navbar/Sidebar can react immediately after login
  const { setRole } = useAuth();

  // CRITICAL: Handle redirect result and existing auth state
  useEffect(() => {
    const handleRedirectResult = async () => {
      const firebaseApp = initFirebaseClient();
      if (!firebaseApp) {
        setProcessingRedirect(false);
        return;
      }

      const authInstance = getFirebaseAuth();
      if (!authInstance) {
        setProcessingRedirect(false);
        return;
      }

      setAuth(authInstance);
      setDb(getFirestore(firebaseApp));
      setFirebaseReady(true);

      // Listen for existing auth state first (handles already-logged-in users)
      const unsubscribe = onAuthStateChanged(authInstance, async (user) => {
        if (user) {
          // User is already authenticated - check their role and redirect
          console.log("[Login] Existing user detected:", user.email);
          const uid = user.uid;
          const firestoreDb = getFirestore(firebaseApp);
          const ref = doc(firestoreDb, "users", uid);
          const snap = await getDoc(ref);

          if (!snap.exists()) {
            // New user that somehow has auth but no doc
            console.log("[Login] Existing auth, no doc - going to onboarding");
            localStorage.removeItem("role");
            setRole(null);
            setProcessingRedirect(false);
            router.push(ONBOARDING_ROUTE);
            return;
          }

          const data = snap.data();
          const userRole = data?.role as Role | undefined;

          if (!userRole) {
            console.log("[Login] Existing auth, no role - going to onboarding");
            localStorage.removeItem("role");
            setRole(null);
            setProcessingRedirect(false);
            router.push(ONBOARDING_ROUTE);
            return;
          }

          console.log("[Login] Existing user with role:", userRole);
          setProcessingRedirect(false);
          routeByRole(userRole);
          return;
        }

        // No existing user - check if we just returned from a Google redirect
        try {
          console.log("[Login] Checking for redirect result...");
          const result = await getRedirectResult(authInstance);

          if (result) {
            console.log("[Login] Redirect result received:", result.user.email);
            const user = result.user;
            const uid = user.uid;

            const firestoreDb = getFirestore(firebaseApp);
            const ref = doc(firestoreDb, "users", uid);
            const snap = await getDoc(ref);

            // First-time Google user → create minimal doc and force onboarding
            if (!snap.exists()) {
              console.log("[Login] New user, creating Firestore doc");
              await setDoc(
                ref,
                {
                  email: user.email ?? "",
                  role: null,
                  phone: "",
                  name: "",
                  businessName: null,
                  credits: 3,
                  createdAt: Date.now(),
                },
                { merge: true }
              );

              localStorage.removeItem("role");
              setRole(null);
              setProcessingRedirect(false);
              router.push(ONBOARDING_ROUTE);
              return;
            }

            const data = snap.data();
            const userRole = data?.role as Role | undefined;

            // Existing user but role not assigned yet → onboarding
            if (!userRole) {
              console.log("[Login] Existing user, no role - going to onboarding");
              localStorage.removeItem("role");
              setRole(null);
              setProcessingRedirect(false);
              router.push(ONBOARDING_ROUTE);
              return;
            }

            // Known role → update context/localStorage and route
            console.log("[Login] Existing user with role:", userRole);
            setProcessingRedirect(false);
            routeByRole(userRole);
          } else {
            console.log("[Login] No redirect result - showing login page");
            setProcessingRedirect(false);
          }
        } catch (err: any) {
          console.error("[Login] Redirect result error:", err);
          setError(translateError(err?.code, err?.message));
        } finally {
          setProcessingRedirect(false);
        }
      });

      return () => unsubscribe();
    };

    handleRedirectResult();
  }, [router, setRole]);

  // login/signup toggle
  const [mode, setMode] = useState<"login" | "signup">("login");

  // form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // UX state
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false); // email/password flow
  const [googleLoading, setGoogleLoading] = useState(false); // google redirect flow
  const [processingRedirect, setProcessingRedirect] = useState(true); // CRITICAL: Show loading while checking redirect

  // Basic client-side password rules (signup only)
  const passwordValid = (pwd: string) => {
    const hasUpper = /[A-Z]/.test(pwd);
    const hasNumber = /[0-9]/.test(pwd);
    const hasSymbol = /[\W_]/.test(pwd);
    const longEnough = pwd.length >= 6;
    return hasUpper && hasNumber && hasSymbol && longEnough;
  };

  // Minimal email sanity check (not a full RFC validator)
  const emailValid = (em: string) => /\S+@\S+\.\S+/.test(em);

  // Map Firebase auth errors to human-friendly messages
  const translateError = (code: string, message?: string) => {
    switch (code) {
      case "auth/invalid-email":
        return "Please enter a valid email address.";
      case "auth/email-already-in-use":
        return "That email is already registered.";
      case "auth/wrong-password":
        return "Incorrect password.";
      case "auth/user-not-found":
        return "No account found with that email.";
      case "auth/weak-password":
        return "Your password is too weak.";
      case "auth/too-many-requests":
        return "Too many attempts. Try again later.";
      case "auth/popup-closed-by-user":
        return "";
      case "auth/popup-blocked":
        return "Popup was blocked. Please allow popups for this site.";
      case "auth/cancelled-popup-request":
        return "";
      default:
        if (message?.includes("Cross-Origin-Opener-Policy")) {
          return "Browser security policy blocked the popup. Please try again or use email/password login.";
        }
        return "Something went wrong. Please try again.";
    }
  };

  /**
   * Password reset uses the current email field.
   */
  const handleForgotPassword = async () => {
    setError(null);

    if (!email) {
      setError("Please enter your email first.");
      return;
    }

    if (!auth) {
      setError("Firebase is not configured. Missing NEXT_PUBLIC_FIREBASE_* env vars.");
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);
      alert("Password reset email sent! Check your inbox.");
    } catch (err: any) {
      setError(err?.message || "Failed to send reset email.");
    }
  };

  // One place to update role everywhere + route accordingly
  const routeByRole = (userRole: Role | undefined) => {
    if (userRole) {
      setRole(userRole);
      if (typeof window !== "undefined") {
        localStorage.setItem("role", userRole);
      }
    }

    // Route based on role (fallback to home)
    if (userRole === "driver") router.push("/driver");
    else if (userRole === "business") router.push("/business");
    else if (userRole === "admin") router.push("/admin");
    else router.push("/");
  };

  /**
   * Onboarding path
   */
  const sendToOnboarding = async (uid: string, emailValue: string | null) => {
    if (!db) {
      setError("Firebase is not configured. Missing NEXT_PUBLIC_FIREBASE_* env vars.");
      return;
    }

    const ref = doc(db, "users", uid);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      await setDoc(ref, {
        email: emailValue ?? "",
        role: null,
        phone: "",
        name: "",
        businessName: null,
        credits: 3,
        createdAt: Date.now(),
      });
    }

    localStorage.removeItem("role");
    setRole(null);
    router.push(ONBOARDING_ROUTE);
  };

  /**
   * Email/password login or signup
   */
  const handleSubmit = async () => {
    setError(null);

    if (!auth || !db) {
      setError("Firebase is not configured. Missing NEXT_PUBLIC_FIREBASE_* env vars.");
      return;
    }

    if (!emailValid(email)) {
      setError("Please enter a valid email.");
      return;
    }

    if (mode === "signup" && !passwordValid(password)) {
      setError("Password must have 6+ characters, 1 uppercase, 1 number, and 1 symbol.");
      return;
    }

    setLoading(true);

    try {
      if (mode === "login") {
        const userCred = await signInWithEmailAndPassword(auth, email, password);

        const uid = userCred.user.uid;
        const ref = doc(db, "users", uid);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          await sendToOnboarding(uid, userCred.user.email ?? email);
          return;
        }

        const data = snap.data();
        const userRole = data?.role as Role | undefined;

        if (!userRole) {
          await sendToOnboarding(uid, userCred.user.email ?? email);
          return;
        }

        await updateDoc(doc(db, "users", uid), {
          lastLoginAt: serverTimestamp(),
        });

        routeByRole(userRole);
      } else {
        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        const uid = userCred.user.uid;

        await setDoc(
          doc(db, "users", uid),
          {
            email,
            role: null,
            phone: "",
            name: "",
            businessName: null,
            credits: 3,
            createdAt: Date.now(),
          },
          { merge: true }
        );

        localStorage.removeItem("role");
        setRole(null);
        router.push(ONBOARDING_ROUTE);
      }
    } catch (err: any) {
      const msg = translateError(err?.code, err?.message);
      if (msg) setError(msg);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Google redirect login
   * CRITICAL: Uses signInWithRedirect instead of signInWithPopup to avoid COOP issues
   */
  const handleGoogleLogin = async () => {
    setError(null);

    if (!auth) {
      setError("Firebase is not configured. Missing NEXT_PUBLIC_FIREBASE_* env vars.");
      return;
    }

    setGoogleLoading(true);

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });

      console.log("[Login] Initiating Google redirect...");
      // CRITICAL: Use signInWithRedirect instead of signInWithPopup
      await signInWithRedirect(auth, provider);
      // Page will redirect to Google, then back to this page
    } catch (err: any) {
      console.error("[Login] Google redirect error:", err);
      const msg = translateError(err?.code, err?.message);
      if (msg) setError(msg);
      setGoogleLoading(false);
    }
  };

  // CRITICAL: Show loading screen while checking redirect result
  // This prevents showing "Welcome Back" while Firebase processes the redirect
  if (processingRedirect) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-screen bg-gray-100">
      <div className="bg-white p-10 rounded-xl shadow-lg w-full max-w-md">
        {/* login/signup toggle */}
        <div className="flex justify-center mb-6">
          <button
            className={`px-4 py-2 font-semibold ${
              mode === "login"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500"
            }`}
            onClick={() => setMode("login")}
          >
            Login
          </button>

          <button
            className={`px-4 py-2 font-semibold ${
              mode === "signup"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500"
            }`}
            onClick={() => setMode("signup")}
          >
            Sign Up
          </button>
        </div>

        <h1 className="text-2xl font-semibold mb-6 text-center">
          {mode === "login" ? "Welcome Back" : "Create an Account"}
        </h1>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="space-y-4"
        >
          <input
            type="email"
            placeholder="Email"
            className={`w-full p-3 border rounded-lg ${
              !!error && !emailValid(email) ? "border-red-400" : ""
            }`}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            type="password"
            placeholder="Password"
            className={`w-full p-3 border rounded-lg ${
              !!error && mode === "signup" && !passwordValid(password)
                ? "border-red-400"
                : ""
            }`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {mode === "login" && (
            <button
              type="button"
              className="text-blue-600 text-sm mt-2 hover:underline"
              onClick={handleForgotPassword}
            >
              Forgot password?
            </button>
          )}

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading || googleLoading || !firebaseReady}
            className="w-full bg-blue-600 text-white py-3 rounded-lg mt-6 hover:bg-blue-700 transition disabled:bg-gray-400"
          >
            {!firebaseReady ? "Loading..." : loading ? "Loading..." : mode === "login" ? "Login" : "Sign Up"}
          </button>
        </form>

        {/* Divider + Google button */}
        <>
          <div className="flex items-center gap-2 my-6">
            <span className="h-px flex-1 bg-gray-300" />
            <span className="text-xs text-gray-400">OR</span>
            <span className="h-px flex-1 bg-gray-300" />
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={googleLoading || loading || !firebaseReady}
            className="w-full flex items-center justify-center gap-2 border border-gray-300 py-3 rounded-lg hover:bg-gray-50 transition disabled:bg-gray-200"
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 533.5 544.3"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M533.5 278.4c0-17.4-1.5-34.1-4.3-50.4H272.1v95.3h147.2c-6.4 34.5-25.7 63.7-54.8 83.3v68h88.6c51.8-47.7 80.4-118.1 80.4-196.2z"
                fill="#4285f4"
              />
              <path
                d="M272.1 544.3c73.7 0 135.6-24.4 180.8-66.1l-88.6-68c-24.6 16.5-56.2 26-92.2 26-70.9 0-131-47.9-152.6-112.3h-91.3v70.6c45.1 89.2 137.7 149.8 243.9 149.8z"
                fill="#34a853"
              />
              <path
                d="M119.5 323.9c-10.5-31.5-10.5-65.4 0-96.9v-70.6H28.2c-37.9 75.8-37.9 162.3 0 238.1l91.3-70.6z"
                fill="#fbbc04"
              />
              <path
                d="M272.1 107.7c38.9-.6 76.2 14 104.6 40.9l77.9-77.9C407.5 24.5 344.1-.3 272.1 0 165.9 0 73.3 60.6 28.2 149.8l91.3 70.6c21.6-64.4 81.7-112.3 152.6-112.7z"
                fill="#ea4335"
              />
            </svg>
            <span className="text-sm font-medium text-gray-700">
              {googleLoading ? "Redirecting to Google..." : "Continue with Google"}
            </span>
          </button>
        </>
      </div>
    </div>
  );
}
