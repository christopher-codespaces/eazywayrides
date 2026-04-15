"use client";

// Providers placeholder - Firebase Auth is handled via AuthContext
// No SessionProvider needed when using Firebase Authentication
import type { ReactNode } from "react";

export function NextAuthProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
