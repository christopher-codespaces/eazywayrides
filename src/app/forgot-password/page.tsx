"use client";

/**
 * Forgot Password Page
 * =============================================================================
 * Allows users to reset their password via Firebase email reset.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getAuth, sendPasswordResetEmail, type Auth } from "firebase/auth";
import { initFirebaseClient } from "@/lib/firebaseClient";

const translateError = (code: string, message?: string) => {
  switch (code) {
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/user-not-found":
      return "No account found with that email.";
    case "auth/too-many-requests":
      return "Too many attempts. Try again later.";
    case "auth/network-request-failed":
      return "Network error. Check your connection and try again.";
    default:
      if (message?.includes("Cross-Origin-Opener-Policy")) {
        return "Browser security policy blocked the request. Please try again.";
      }
      return "Failed to send reset email. Please try again.";
  }
};

export default function ForgotPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [auth, setAuth] = useState<Auth | null>(null);

  const [email, setEmail] = useState(() => searchParams.get("email") ?? "");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const firebaseApp = initFirebaseClient();
    if (!firebaseApp) {
      setError("Firebase is not configured.");
      return;
    }
    setAuth(getAuth(firebaseApp));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!auth) {
      setError("Firebase is not configured.");
      return;
    }

    const emailTrimmed = email.trim();
    if (!emailTrimmed || !/\S+@\S+\.\S+/.test(emailTrimmed)) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);

    try {
      await sendPasswordResetEmail(auth, emailTrimmed);
      setSuccess(true);
    } catch (err: any) {
      const msg = translateError(err?.code, err?.message);
      if (msg) setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center h-screen bg-gray-100">
      <div className="bg-white p-10 rounded-xl shadow-lg w-full max-w-md">
        <button
          onClick={() => router.push("/login")}
          className="text-sm text-gray-500 hover:text-gray-700 mb-4 flex items-center gap-1"
        >
          <span>←</span> Back to login
        </button>

        <h1 className="text-2xl font-semibold mb-2 text-center">Reset Password</h1>
        <p className="text-gray-500 text-sm text-center mb-6">
          Enter your email and we&apos;ll send you a link to reset your password.
        </p>

        {success ? (
          <div className="text-center space-y-4">
            <div className="text-green-600 text-lg">✓ Check your inbox</div>
            <p className="text-gray-600 text-sm">
              We sent a password reset link to <strong>{email}</strong>.
              Check your spam folder if you don&apos;t see it.
            </p>
            <button
              onClick={() => router.push("/login")}
              className="text-blue-600 text-sm hover:underline"
            >
              Back to login
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email"
              placeholder="Email"
              className={`w-full p-3 border rounded-lg text-black ${
                !!error && !/\S+@\S+\.\S+/.test(email) ? "border-red-400" : ""
              }`}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError(null);
              }}
              autoFocus
            />

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition disabled:bg-gray-400"
            >
              {loading ? "Sending..." : "Send Reset Link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
