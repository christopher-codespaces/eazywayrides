import { cookies } from "next/headers";
import { adminAuth } from "./firebaseAdmin";

export async function requireAuth() {
  const cookieStore = await cookies(); // 👈 await is REQUIRED now
  const sessionCookie = cookieStore.get("__session")?.value;

  if (!sessionCookie) {
    throw new Error("UNAUTHENTICATED");
  }

  const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
  return decoded;
}
