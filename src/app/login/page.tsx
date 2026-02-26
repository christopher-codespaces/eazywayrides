"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import { app } from "@/lib/firebase";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { useAuth } from "@/app/context/AuthContext";

const ONBOARDING_ROUTE = "/complete-signup";

// Keep roles tight/explicit since routing + UI depends on this
type Role = "driver" | "business" | "admin";

export default function LoginPage() {
  /**
   * Firebase client dependencies (Auth + Firestore)
   * ---------------------------------------------------------------------------
   * In this codebase, `app` is typed as `FirebaseApp | null` to allow builds
   * to succeed when NEXT_PUBLIC_FIREBASE_* env vars are missing (CI/review builds).
   *
   * So we must NEVER call getAuth(app) / getFirestore(app) directly.
   * Instead:
   * - initialise them only when `app` exists
   * - otherwise keep them null and show a clear error in the UI
   */
  const auth = useMemo(() => (app ? getAuth(app) : null), [app]);
  const db = useMemo(() => (app ? getFirestore(app) : null), [app]);

  const router = useRouter();

  // Role lives in context so Navbar/Sidebar can react immediately after login
  const { setRole } = useAuth();

  // login/signup toggle
  const [mode, setMode] = useState<"login" | "signup">("login");

  // form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // UX state
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false); // email/password flow
  const [googleLoading, setGoogleLoading] = useState(false); // google popup flow

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
  const translateError = (code: string) => {
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
        return ""; // user closed the Google popup — not really an error
      default:
        return "Something went wrong. Please try again.";
    }
  };

  /**
   * Password reset uses the current email field.
   * Guard behaviour:
   * - If Firebase Auth isn't available (missing env), exit gracefully.
   */
  const handleForgotPassword = async () => {
    setError(null);

    if (!email) {
      setError("Please enter your email first.");
      return;
    }

    // Guard: Firebase client not configured
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
    // Persist role in context + localStorage so UI stays consistent on refresh
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
   * Onboarding path:
   * - ensures a user doc exists
   * - clears role in UI
   * - routes to /complete-signup
   *
   * Guard behaviour:
   * - requires Firestore
   */
  const sendToOnboarding = async (uid: string, emailValue: string | null) => {
    if (!db) {
      setError("Firebase is not configured. Missing NEXT_PUBLIC_FIREBASE_* env vars.");
      return;
    }

    const ref = doc(db, "users", uid);
    const snap = await getDoc(ref);

    // If auth exists but Firestore doc doesn't, create a minimal placeholder
    if (!snap.exists()) {
      await setDoc(ref, {
        email: emailValue ?? "",
        role: null, // role assigned during onboarding
        phone: "", // <-- added
        name: "",
        businessName: null,
        createdAt: Date.now(),
      });
    }

    // Make sure UI is "public" until onboarding assigns a role
    if (typeof window !== "undefined") localStorage.removeItem("role");
    setRole(null);

    router.push(ONBOARDING_ROUTE);
  };

  /**
   * Email/password login or signup
   * Guard behaviour:
   * - requires both Auth + Firestore
   */
  const handleSubmit = async () => {
    setError(null);

    // Guard: Firebase client not configured
    if (!auth || !db) {
      setError("Firebase is not configured. Missing NEXT_PUBLIC_FIREBASE_* env vars.");
      return;
    }

    // quick client-side validation
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
        // LOGIN: auth first, then decide route based on Firestore role
        const userCred = await signInWithEmailAndPassword(auth, email, password);

        const uid = userCred.user.uid;
        const ref = doc(db, "users", uid);
        const snap = await getDoc(ref);

        // Auth user exists but no profile doc → onboarding
        if (!snap.exists()) {
          await sendToOnboarding(uid, userCred.user.email ?? email);
          return;
        }

        const data = snap.data();
        const userRole = data?.role as Role | undefined;

        // Doc exists but role not set yet → onboarding
        if (!userRole) {
          await sendToOnboarding(uid, userCred.user.email ?? email);
          return;
        }

        // Update login timestamp (non-blocking but useful)
        await updateDoc(doc(db, "users", uid), {
          lastLoginAt: serverTimestamp(),
        });

        // Known role → set context/localStorage and route
        routeByRole(userRole);
      } else {
        // SIGNUP: create auth user, create minimal Firestore doc, then onboarding
        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        const uid = userCred.user.uid;

        await setDoc(
          doc(db, "users", uid),
          {
            email,
            role: null,
            phone: "", // <-- added
            name: "",
            businessName: null,
            createdAt: Date.now(),
          },
          { merge: true }
        );

        // No role yet until onboarding completes
        if (typeof window !== "undefined") localStorage.removeItem("role");
        setRole(null);

        router.push(ONBOARDING_ROUTE);
      }
    } catch (err: any) {
      const msg = translateError(err?.code || err?.message);
      if (msg) setError(msg);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Google popup login
   * Guard behaviour:
   * - requires both Auth + Firestore
   */
  const handleGoogleLogin = async () => {
    setError(null);

    // Guard: Firebase client not configured
    if (!auth || !db) {
      setError("Firebase is not configured. Missing NEXT_PUBLIC_FIREBASE_* env vars.");
      return;
    }

    setGoogleLoading(true);

    try {
      const provider = new GoogleAuthProvider();
      // provider.setCustomParameters({ prompt: "select_account" });

      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      const uid = user.uid;
      const ref = doc(db, "users", uid);
      const snap = await getDoc(ref);

      // First-time Google user → create minimal doc and force onboarding
      if (!snap.exists()) {
        await setDoc(
          ref,
          {
            email: user.email ?? "",
            role: null,
            phone: "", // <-- added
            name: "",
            businessName: null,
            createdAt: Date.now(),
          },
          { merge: true }
        );

        if (typeof window !== "undefined") localStorage.removeItem("role");
        setRole(null);

        router.push(ONBOARDING_ROUTE);
        return;
      }

      const data = snap.data();
      const userRole = data?.role as Role | undefined;

      // Existing user but role not assigned yet → onboarding
      if (!userRole) {
        if (typeof window !== "undefined") localStorage.removeItem("role");
        setRole(null);

        router.push(ONBOARDING_ROUTE);
        return;
      }

      // Known role → update context/localStorage and route
      routeByRole(userRole);
    } catch (err: any) {
      const msg = translateError(err?.code || err?.message);
      if (msg) setError(msg);
    } finally {
      setGoogleLoading(false);
    }
  };

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

          {/* Only show reset link on login */}
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
            disabled={loading || googleLoading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg mt-6 hover:bg-blue-700 transition disabled:bg-gray-400"
          >
            {loading ? "Loading..." : mode === "login" ? "Login" : "Sign Up"}
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
            disabled={googleLoading || loading}
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
              {googleLoading ? "Connecting..." : "Continue with Google"}
            </span>
          </button>
        </>
      </div>
    </div>
  );
}
