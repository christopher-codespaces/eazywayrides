"use client";

/**
 * Firebase Client Initializer
 * =============================================================================
 * Prevents Firebase from running during SSR/prerender.
 * Sets a global `app` variable for compatibility with existing code.
 * Must be called from useEffect in each client component.
 */

import { initializeApp, getApps } from "firebase/app";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Global app — starts as null (SSR-safe)
// Components import { app } from "@/lib/firebase" which re-exports this
let _app: any = null;
let _initialized = false;

export let app: any = null;

/**
 * MUST be called from useEffect in each client component.
 * Returns the Firebase app (or null during SSR / missing env vars).
 */
export function initFirebaseClient(): any {
  if (typeof window === "undefined") return null;

  if (!_initialized) {
    _initialized = true;
    if (!getApps().length) {
      _app = initializeApp(firebaseConfig);
    } else {
      _app = getApps()[0];
    }
    app = _app;
  }

  return _app;
}

export function getFirebaseApp(): any {
  return _app;
}