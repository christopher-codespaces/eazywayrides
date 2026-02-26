"use client";

import { useMemo } from "react";
import type { FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

/**
 * Firebase Client Access (Auth + Firestore)
 * =============================================================================
 * What this file does
 * -------------------
 * Provides a single, reusable way to access Firebase client SDK instances
 * without crashing builds when NEXT_PUBLIC_FIREBASE_* variables are missing.
 *
 * Behavior
 * --------
 * - If `app` is null:
 *     { auth: null, db: null, isConfigured: false }
 * - If `app` exists:
 *     { auth, db, isConfigured: true }
 *
 * Why this exists
 * ---------------
 * - Prevents build / prerender crashes
 * - Avoids calling Firebase SDKs when env vars are missing
 * - Makes "Firebase not configured" an explicit state
 *
 * This hook is SAFE to use in:
 * - App Router pages
 * - Client components
 * - CI / review builds with no Firebase env vars
 */
export function useFirebaseClient(app: FirebaseApp | null): {
  auth: Auth | null;
  db: Firestore | null;
  isConfigured: boolean;
} {
  const isConfigured = !!app;

  const auth = useMemo(() => (app ? getAuth(app) : null), [app]);
  const db = useMemo(() => (app ? getFirestore(app) : null), [app]);

  return { auth, db, isConfigured };
}
