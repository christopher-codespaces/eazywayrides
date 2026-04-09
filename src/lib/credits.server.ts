import "server-only";
import { getAdminDb } from "@/lib/firebaseAdmin.server";

export type ConsumeCreditResult =
  | { success: true }
  | { success: false; reason: "NO_CREDITS" | "USER_NOT_FOUND" | "TRANSACTION_FAILED" };

/**
 * Atomically consumes 1 credit from a user's balance.
 * Uses a Firestore transaction to prevent race conditions.
 *
 * Firestore path: users/{userId}.credits.balance (number)
 *
 * @param userId - The user's uid
 * @returns ConsumeCreditResult indicating success or specific failure reason
 */
export async function consumeCredit(userId: string): Promise<ConsumeCreditResult> {
  const db = getAdminDb();
  const userRef = db.collection("users").doc(userId);

  try {
    const result = await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);

      if (!userSnap.exists) {
        return "USER_NOT_FOUND";
      }

      const data = userSnap.data();
      const balance = data?.credits?.balance ?? 0;

      if (balance <= 0) {
        return "NO_CREDITS";
      }

      tx.update(userRef, {
        "credits.balance": balance - 1,
        updatedAt: new Date(),
      });

      return "SUCCESS";
    });

    if (result === "SUCCESS") {
      return { success: true };
    }

    return { success: false, reason: result };
  } catch {
    return { success: false, reason: "TRANSACTION_FAILED" };
  }
}