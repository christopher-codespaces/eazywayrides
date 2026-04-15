"use client";

/**
 * Auth Context Re-export
 * =============================================================================
 * This file re-exports the AuthProvider and useAuth from _hooks/useAuth
 * to maintain backward compatibility with imports from @/app/context/AuthContext
 */

export { AuthProvider, useAuth } from "@/app/_hooks/useAuth";
