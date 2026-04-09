/**
 * Firebase Client SDK entry point
 * =============================================================================
 * Re-exports the client initializer so that existing code using:
 *   import { app } from "@/lib/firebase"
 * continues to work.
 *
 * IMPORTANT: Firebase client must ONLY run in the browser.
 * - Always call initFirebaseClient() inside useEffect
 * - Never access Firebase at module scope during SSR
 */

export { app, initFirebaseClient, getFirebaseApp } from "./firebaseClient";