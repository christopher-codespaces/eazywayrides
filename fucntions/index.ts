import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();

type SetAdminPayload = {
  uid: string;
  makeAdmin: boolean;
};

/**
 * Callable: setAdminClaim
 * Only callable by an existing admin (custom claim admin=true).
 */
export const setAdminClaim = functions.https.onCall(
  async (data: SetAdminPayload, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Not signed in.");
    }

    const caller = await admin.auth().getUser(context.auth.uid);
    const callerIsAdmin = caller.customClaims?.admin === true;

    if (!callerIsAdmin) {
      throw new functions.https.HttpsError("permission-denied", "Admin only.");
    }

    if (!data?.uid || typeof data.makeAdmin !== "boolean") {
      throw new functions.https.HttpsError("invalid-argument", "uid + makeAdmin required.");
    }

    const targetUser = await admin.auth().getUser(data.uid);
    const existingClaims = targetUser.customClaims ?? {};

    const newClaims = { ...existingClaims, admin: data.makeAdmin };
    await admin.auth().setCustomUserClaims(data.uid, newClaims);

    return { ok: true, uid: data.uid, admin: data.makeAdmin };
  }
);