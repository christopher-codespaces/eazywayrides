// src/lib/firebaseAdmin.ts
/**
 * Firebase Admin SDK (Server-Side Singleton)
 * =============================================================================
 * What this file does
 * -------------------
 * Provides a single, reusable Firebase Admin instance for:
 * - Firestore server reads/writes (privileged, server-only)
 * - Firebase Auth token verification (server-side)
 *
 * Why a singleton is used
 * -----------------------
 * - Next.js may reload modules during development.
 * - Firebase Admin must not be initialised multiple times.
 * - getApps() is used to reuse the existing app instance safely.
 *
 * POPIA (South Africa) considerations
 * ----------------------------------
 * - Safeguards: privileged operations run server-side only.
 * - Data minimisation: this module exposes admin services, not user data.
 *
 * Security constraints
 * --------------------
 * - Must never be imported into client components.
 * - Must use server-only environment variables (no NEXT_PUBLIC_).
 */

import "server-only";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Reads required environment variables.
 *
 * Behavior:
 * - Throws immediately when a required variable is missing.
 * - Fails fast to avoid running with a partially configured admin client.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

/**
 * EAGER INITIALISATION (DISABLED)
 * -----------------------------------------------------------------------------
 * This eager initialisation is intentionally commented out.
 *
 * Reason:
 * - Next.js may import server modules during `next build`
 * - Eager Admin SDK initialisation reads server-only env vars at import time
 * - This causes build-time failures when secrets are not present (contributors/CI)
 *
 * Status:
 * - Disabled in favour of the lazy initialisation below (active)
 * - Can be restored once all runtime environments guarantee Firebase Admin env vars
 *
 * IMPORTANT:
 * - Do NOT re-enable this block without removing the lazy implementation below,
 *   or build-time failures will return.
 */

/*
const serviceAccount = {
  projectId: requireEnv("FIREBASE_PROJECT_ID"),
  clientEmail: requireEnv("FIREBASE_CLIENT_EMAIL"),
  privateKey: requireEnv("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n"),
};

const adminApp =
  getApps().length === 0
    ? initializeApp({ credential: cert(serviceAccount) })
    : getApps()[0];

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
*/

/**
 * LAZY INITIALISATION (ACTIVE)
 * -----------------------------------------------------------------------------
 * Firebase Admin is initialised lazily to ensure:
 * - `next build` succeeds without server secrets
 * - Admin SDK is initialised only when a server request requires it
 *
 * Env variables are validated at call time, not import time.
 */

let cachedAdmin:
  | { auth: ReturnType<typeof getAuth>; db: ReturnType<typeof getFirestore> }
  | null = null;

/**
 * Initialises and returns Firebase Admin clients.
 *
 * Behavior:
 * - First call initialises Admin using service account env vars
 * - Subsequent calls reuse the cached clients (singleton)
 */
function getAdminClients() {
  if (cachedAdmin) return cachedAdmin;

  const serviceAccount = {
    projectId: requireEnv("FIREBASE_PROJECT_ID"),
    clientEmail: requireEnv("FIREBASE_CLIENT_EMAIL"),
    privateKey: requireEnv("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n"),
  };

  const adminApp =
    getApps().length === 0
      ? initializeApp({ credential: cert(serviceAccount) })
      : getApps()[0];

  cachedAdmin = {
    auth: getAuth(adminApp),
    db: getFirestore(adminApp),
  };

  return cachedAdmin;
}

/**
 * Firebase Admin Auth (server-only).
 * Used for ID token verification.
 */
export function getAdminAuth() {
  return getAdminClients().auth;
}

/**
 * Sets Firebase Custom Claims to grant admin role.
 *
 * Usage:
 *   await makeUserAdmin("uid-here");
 *
 * Note: After calling this, the user must refresh their ID token:
 *   await auth.currentUser.getIdToken(true);
 */
export async function makeUserAdmin(uid: string): Promise<void> {
  const auth = getAdminAuth();
  await auth.setCustomUserClaims(uid, { admin: true });
  console.log(`User ${uid} is now an admin`);
}

/**
 * Firebase Admin Firestore (server-only).
 * Used for privileged repository access.
 */
export function getAdminDb() {
  return getAdminClients().db;
}
