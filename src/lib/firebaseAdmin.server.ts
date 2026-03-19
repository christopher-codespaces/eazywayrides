import admin from "firebase-admin";

function getPrivateKey() {
  const key = process.env.FIREBASE_PRIVATE_KEY;
  if (!key) throw new Error("Missing FIREBASE_PRIVATE_KEY");
  return key.replace(/\\n/g, "\n");
}

export function getAdminApp() {
  if (admin.apps.length) return admin.app();

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: getPrivateKey(),
    }),
  });

  return admin.app();
}

export function getAdminDb() {
  getAdminApp();
  return admin.firestore();
}

export { admin };
