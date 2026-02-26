"use client";

// Firebase client setup.
// - Safe to import multiple times (singleton)
// - Analytics only runs in the browser

import { initializeApp, getApps, getApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";

// Firebase config pulled from env vars.
// NEXT_PUBLIC_ is required since this runs on the client.
// `!` is intentional — app should fail fast if these are missing.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID!,
};

// Prevent Firebase from being initialized more than once
// (Next.js can re-run modules during hot reload)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Analytics is optional and client-only
let analytics: any = null;

// Only enable analytics in the browser and if supported
if (typeof window !== "undefined") {
  isSupported().then((supported) => {
    if (supported) analytics = getAnalytics(app);
  });
}

// `app` is always safe to use
// `analytics` may be null — don’t assume it exists
export { app, analytics };
