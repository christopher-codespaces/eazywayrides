import { cookies } from "next/headers";
import { getAdminAuth } from "./firebaseAdmin";

export async function requireAuth() {
  const cookieStore = await cookies(); // 👈 await is REQUIRED now
  const sessionCookie = cookieStore.get("__session")?.value;

  if (!sessionCookie) {
    throw new Error("UNAUTHENTICATED");
  }

  const decoded = await getAdminAuth().verifySessionCookie(sessionCookie, true);
  return decoded;
}
