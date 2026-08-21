// Server-only Firebase Admin SDK client. Verifies Firebase ID tokens and
// manages users (custom claims, bulk import). Never import this from a
// route file or *.functions.ts — those ship to the client bundle. Load it
// inside server handlers only, e.g.:
//   const { firebaseAdmin } = await import("@/integrations/firebase/admin");
import { initializeApp, getApps, getApp, cert, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

function createFirebaseAdminApp(): App {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_KEY environment variable.");
  }

  const serviceAccount = JSON.parse(raw);
  return getApps().length ? getApp() : initializeApp({ credential: cert(serviceAccount) });
}

let _app: App | undefined;

function getFirebaseAdminApp(): App {
  if (!_app) _app = createFirebaseAdminApp();
  return _app;
}

export const firebaseAdminAuth = new Proxy({} as ReturnType<typeof getAuth>, {
  get(_, prop, receiver) {
    return Reflect.get(getAuth(getFirebaseAdminApp()), prop, receiver);
  },
});
