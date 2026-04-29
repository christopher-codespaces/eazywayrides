"use client";

/**
 * Login Page
 * =============================================================================
 * Handles email/password and Google (redirect) authentication.
 *
 * Flow:
 * 1. User submits credentials or clicks Google login
 * 2. For Google: redirects to Google OAuth, then back to this page
 * 3. useAuth hook handles getRedirectResult and sets user/role
 * 4. This page watches role changes and redirects to appropriate dashboard
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithRedirect,
  type Auth,
} from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { initFirebaseClient } from "@/lib/firebaseClient";
import { useAuth } from "@/app/_hooks/useAuth";

const ONBOARDING_ROUTE = "/complete-signup";

type Role = "driver" | "business" | "admin";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { role, user, initialized } = useAuth();

  // Firebase instances
  const [auth, setAuth] = useState<Auth | null>(null);
  const [db, setDb] = useState<any>(null);

  // UI state
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Initialize Firebase
  useEffect(() => {
    const firebaseApp = initFirebaseClient();
    if (!firebaseApp) return;

    setAuth(getAuth(firebaseApp));
    setDb(getFirestore(firebaseApp));
  }, []);

  // Handle redirects based on auth state
  useEffect(() => {
    // Wait for auth to be initialized
    if (!initialized) return;

    // If user is already logged in with a role, redirect to dashboard
    if (user && role) {
      routeByRole(role);
    }
    // If user is logged in but no role, send to onboarding
    else if (user && !role) {
      router.push(ONBOARDING_ROUTE);
    }
  }, [user, role, initialized, router]);

  const routeByRole = (userRole: Role) => {
    const redirectTo = searchParams.get("redirect");
    if (redirectTo && redirectTo.startsWith("/")) {
      router.push(redirectTo);
    } else if (userRole === "driver") {
      router.push("/driver");
    } else if (userRole === "business") {
      router.push("/business");
    } else if (userRole === "admin") {
      router.push("/admin");
    }
  };

  const passwordValid = (pwd: string) => {
    const hasUpper = /[A-Z]/.test(pwd);
    const hasNumber = /[0-9]/.test(pwd);
    const hasSymbol = /[\W_]/.test(pwd);
    const longEnough = pwd.length >= 6;
    return hasUpper && hasNumber && hasSymbol && longEnough;
  };

  const emailValid = (em: string) => /\S+@\S+\.\S+/.test(em);

  const translateError = (code: string, message?: string) => {
    switch (code) {
      case "auth/invalid-email":
        return "Please enter a valid email address.";
      case "auth/email-already-in-use":
        return "That email is already registered.";
      case "auth/wrong-password":
        return "Incorrect password. Please check your password and try again.";
      case "auth/user-not-found":
        return "No account found with that email.";
      case "auth/invalid-credential":
        return "Invalid email or password. Please check your credentials and try again.";
      case "auth/user-disabled":
        return "This account has been disabled. Please contact support.";
      case "auth/weak-password":
        return "Your password is too weak.";
      case "auth/too-many-requests":
        return "Too many failed attempts. Please try again later.";
      case "auth/network-request-failed":
        return "Network error. Please check your internet connection.";
      case "auth/operation-not-allowed":
        return "This sign-in method is not enabled. Please contact support.";
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
        if (message?.includes("Firebase: Error")) {
          return "Authentication failed. Please check your credentials and try again.";
        }
        return "Something went wrong. Please try again.";
    }
  };

  const handleForgotPassword = () => {
    router.push(`/forgot-password?email=${encodeURIComponent(email)}`);
  };

  const handleSubmit = async () => {
    setError(null);

    if (!auth || !db) {
      setError("Firebase is not configured.");
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
          router.push(ONBOARDING_ROUTE);
          return;
        }

        const data = snap.data();
        const userRole = data?.role as Role | undefined;

        if (!userRole) {
          router.push(ONBOARDING_ROUTE);
          return;
        }

        await updateDoc(ref, {
          lastLoginAt: serverTimestamp(),
        });

        // AuthProvider will detect the user change and set the role
        // The useEffect above will then redirect
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
            firstName: "",
            lastName: "",
            businessName: null,
            businessLocation: "",
            businessDescription: "",
            homeAddress: "",
            homeLat: "",
            homeLon: "",
            billing: { credits: 3, totalSpent: 0 },
            credits: 3,
            createdAt: Date.now(),
          },
          { merge: true }
        );

        router.push(ONBOARDING_ROUTE);
      }
    } catch (err: any) {
      const msg = translateError(err?.code, err?.message);
      if (msg) setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);

    if (!auth) {
      setError("Firebase is not configured.");
      return;
    }

    setGoogleLoading(true);

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });

      console.log("[Login] Initiating Google redirect...");
      await signInWithRedirect(auth, provider);
      // Page will reload after redirect - useAuth handles the result
    } catch (err: any) {
      console.error("[Login] Google redirect error:", err);
      const msg = translateError(err?.code, err?.message);
      if (msg) setError(msg);
      setGoogleLoading(false);
    }
  };

  // Show loading while auth is initializing
  if (!initialized) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // If already logged in with role, the useEffect above will redirect
  // This prevents showing the login form briefly before redirect
  if (user && role) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Redirecting...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-screen bg-gray-100">
      <div className="bg-white p-10 rounded-xl shadow-lg w-full max-w-md">
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

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || googleLoading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg mt-6 hover:bg-blue-700 transition disabled:bg-gray-400"
          >
            {loading ? "Loading..." : mode === "login" ? "Login" : "Sign Up"}
          </button>
        </form>

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
            {googleLoading ? "Redirecting to Google..." : "Continue with Google"}
          </span>
        </button>
      </div>
    </div>
  );
}
