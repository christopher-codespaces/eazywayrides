"use client";

/**
 * Firebase Client Initializer
 * =============================================================================
 * Prevents Firebase from running during SSR/prerender.
 * Sets a global `app` variable for compatibility with existing code.
 * Must be called from useEffect in each client component.
 */

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

/**
 * CRITICAL: Use the Firebase app domain, NOT your custom domain.
 * signInWithRedirect requires this exact domain to work correctly
 * and avoid COOP/COEP issues in production.
 *
 * Format: {project-id}.firebaseapp.com
 * Set NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN in your environment variables.
 */
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Global instances
let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _initialized = false;

export let app: FirebaseApp | null = null;

/**
 * MUST be called from useEffect in each client component.
 * Returns the Firebase app (or null during SSR / missing env vars).
 */
export function initFirebaseClient(): FirebaseApp | null {
  if (typeof window === "undefined") return null;

  if (!_initialized) {
    _initialized = true;
    if (!getApps().length) {
      _app = initializeApp(firebaseConfig);
    } else {
      _app = getApps()[0];
    }
    // Initialize auth immediately
    if (_app) {
      _auth = getAuth(_app);
    }
    app = _app;
  }

  return _app;
}

/**
 * Get the Firebase Auth instance.
 * Must call initFirebaseClient() first in a useEffect.
 */
export function getFirebaseAuth(): Auth | null {
  if (typeof window === "undefined") return null;
  if (!_auth && app) {
    _auth = getAuth(app);
  }
  return _auth;
}

export function getFirebaseApp(): FirebaseApp | null {
  return _app;
}
