"use client";

/**
 * Protected Route Wrapper
 * =============================================================================
 * Wraps protected pages to ensure:
 * 1. Firebase auth is initialized
 * 2. User is authenticated
 * 3. User has the required role (if specified)
 *
 * Shows loading state while checking auth, redirects to /login if not authenticated.
 */

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/app/context/AuthContext";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: Array<"driver" | "business" | "admin">;
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, role, loading, initialized } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!initialized) {
      return;
    }

    if (!user) {
      console.log("[ProtectedRoute] No user detected, redirecting to login");
      const loginUrl = new URL("/login", window.location.origin);
      loginUrl.searchParams.set("redirect", pathname);
      router.replace(loginUrl.toString());
      return;
    }

    if (allowedRoles && role !== null && !allowedRoles.includes(role)) {
      console.log("[ProtectedRoute] Role mismatch. User has:", role, "Allowed:", allowedRoles);
      if (role === "driver") router.replace("/driver");
      else if (role === "business") router.replace("/business");
      else if (role === "admin") router.replace("/admin");
      else router.replace("/login");
      return;
    }
  }, [user, role, loading, initialized, router, pathname, allowedRoles]);

  if (!initialized || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (allowedRoles && role === null) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading user data...</p>
        </div>
      </div>
    );
  }

  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return null;
  }

  return <>{children}</>;
}
