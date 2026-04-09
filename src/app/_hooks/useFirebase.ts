"use client";

import { useEffect, useState } from "react";
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, getFirestore, type Auth, type Firestore } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

let _app: FirebaseApp | null = null;
let _initialized = false;

/**
 * Lazily initialize Firebase client.
 * Safe to call multiple times — only runs once.
 */
function initFirebase(): FirebaseApp | null {
  if (typeof window === "undefined") return null;
  if (_initialized) return _app;

  _initialized = true;
  if (!getApps().length) {
    _app = initializeApp(firebaseConfig);
  } else {
    _app = getApps()[0];
  }
  return _app;
}

/**
 * useFirebase — client-only hook
 * ---------------------------------------------------------------------------
 * Returns { app, auth, db } after initializing Firebase in the browser.
 * - app/auth/db are null during SSR
 * - auth and db are derived from app so will also be null if app is null
 *
 * Usage:
 *   const { app, auth, db } = useFirebase();
 *   if (!app) return <div>Loading...</div>;
 */
export function useFirebase() {
  const [app, setApp] = useState<FirebaseApp | null>(null);
  const [auth, setAuth] = useState<Auth | null>(null);
  const [db, setDb] = useState<Firestore | null>(null);

  useEffect(() => {
    const firebaseApp = initFirebase();
    if (!firebaseApp) return;
    setApp(firebaseApp);
    setAuth(getAuth(firebaseApp));
    setDb(getFirestore(firebaseApp));
  }, []);

  return { app, auth, db };
}