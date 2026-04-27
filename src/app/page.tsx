"use client";

/**
 * Root Page
 * =============================================================================
 * Acts as a landing page that redirects based on authentication state:
 * - Logged out: redirects to /login
 * - Logged in: redirects to appropriate dashboard based on role
 *
 * This prevents having duplicate login logic at both / and /login.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/context/AuthContext";

export default function RootPage() {
  const router = useRouter();
  const { user, role, initialized } = useAuth();

  useEffect(() => {
    if (!initialized) return;

    if (!user) {
      router.replace("/login");
    } else if (role) {
      if (role === "driver") router.replace("/driver");
      else if (role === "business") router.replace("/business");
      else if (role === "admin") router.replace("/admin");
      else router.replace("/login");
    } else {
      router.replace("/complete-signup");
    }
  }, [user, role, initialized, router]);

  return (
    <div className="flex items-center justify-center h-screen bg-gray-100">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading...</p>
      </div>
    </div>
  );
}
