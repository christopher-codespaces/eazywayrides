"use client";

/**
 * Password Reset Page
 * =============================================================================
 * Handles password reset via Firebase oobCode.
 *
 * Flow:
 * 1. Page loads with oobCode query parameter from Firebase reset email
 * 2. verifyPasswordResetCode validates the code
 * 3. If valid, show form to set new password
 * 4. On submit, call confirmPasswordReset to update the password
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  getAuth,
  verifyPasswordResetCode,
  confirmPasswordReset,
  type Auth,
} from "firebase/auth";
import { initFirebaseClient } from "@/lib/firebaseClient";

type Status = "loading" | "valid" | "invalid" | "success";

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [auth, setAuth] = useState<Auth | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const firebaseApp = initFirebaseClient();
    if (!firebaseApp) {
      setStatus("invalid");
      return;
    }

    const authInstance = getAuth(firebaseApp);
    setAuth(authInstance);

    const oobCode = searchParams.get("oobCode");

    if (!oobCode) {
      setStatus("invalid");
      return;
    }

    verifyPasswordResetCode(authInstance, oobCode)
      .then(() => setStatus("valid"))
      .catch(() => setStatus("invalid"));
  }, [searchParams]);

  const validatePassword = (pwd: string) => {
    const hasUpper = /[A-Z]/.test(pwd);
    const hasNumber = /[0-9]/.test(pwd);
    const hasSymbol = /[\W_]/.test(pwd);
    const longEnough = pwd.length >= 6;
    return hasUpper && hasNumber && hasSymbol && longEnough;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!auth) {
      setError("Firebase is not configured.");
      return;
    }

    const oobCode = searchParams.get("oobCode");
    if (!oobCode) {
      setStatus("invalid");
      return;
    }

    if (!validatePassword(password)) {
      setError("Password must have 6+ characters, 1 uppercase, 1 number, and 1 symbol.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      await confirmPasswordReset(auth, oobCode, password);
      setStatus("success");
    } catch (err: any) {
      if (err?.code === "auth/expired-action-code" || err?.code === "auth/invalid-action-code") {
        setStatus("invalid");
      } else {
        setError("Failed to reset password. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Verifying link...</p>
        </div>
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="bg-white p-10 rounded-xl shadow-lg w-full max-w-md text-center">
          <div className="text-red-500 text-5xl mb-4">✗</div>
          <h1 className="text-2xl font-semibold mb-2">Invalid Link</h1>
          <p className="text-gray-500 mb-6">
            This link is invalid or has expired.
          </p>
          <button
            onClick={() => router.push("/login")}
            className="text-blue-600 hover:underline"
          >
            Back to login
          </button>
        </div>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="bg-white p-10 rounded-xl shadow-lg w-full max-w-md text-center">
          <div className="text-green-500 text-5xl mb-4">✓</div>
          <h1 className="text-2xl font-semibold mb-2">Password Reset</h1>
          <p className="text-gray-500 mb-6">
            Your password has been successfully reset.
          </p>
          <button
            onClick={() => router.push("/login")}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition"
          >
            Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-screen bg-gray-100">
      <div className="bg-white p-10 rounded-xl shadow-lg w-full max-w-md">
        <button
          onClick={() => router.push("/login")}
          className="text-sm text-gray-500 hover:text-gray-700 mb-4 flex items-center gap-1"
        >
          <span>←</span> Back to login
        </button>

        <h1 className="text-2xl font-semibold mb-2 text-center">Set New Password</h1>
        <p className="text-gray-500 text-sm text-center mb-6">
          Enter your new password below.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            placeholder="New Password"
            className={`w-full p-3 border rounded-lg text-black ${
              !!error && !validatePassword(password) ? "border-red-400" : ""
            }`}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError(null);
            }}
            autoFocus
          />

          <input
            type="password"
            placeholder="Confirm Password"
            className={`w-full p-3 border rounded-lg text-black ${
              !!error && password !== confirmPassword ? "border-red-400" : ""
            }`}
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              if (error) setError(null);
            }}
          />

          {error && (
            <p className="text-red-500 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition disabled:bg-gray-400"
          >
            {loading ? "Resetting..." : "Reset Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
