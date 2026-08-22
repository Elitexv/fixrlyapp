// Server-only Firebase Admin SDK client. Verifies Firebase ID tokens. Never
// import this from a route file or *.functions.ts — those ship to the
// client bundle. Load it inside server handlers only, e.g.:
//   const { firebaseAdminAuth } = await import("@/integrations/firebase/admin");
//
// Only verifyIdToken goes through the real firebase-admin package below —
// that's pure local JWT/JWKS verification and survives Vite's SSR bundling
// fine. Anything that needs a live network round-trip to Google (getUser,
// setCustomUserClaims, ...) does NOT: firebase-admin's OAuth2/credential
// machinery relies on Node's CommonJS require()/__dirname resolution
// internally, which breaks once Vite rolls it into a single ESM chunk —
// confirmed live via a real signup attempt against the deployed app, which
// threw "Cannot read properties of undefined (reading 'SDK_VERSION')" from
// exactly that code path. getFirebaseUserCustomClaims/setFirebaseCustomClaims
// below reimplement just those two calls as plain Identity Toolkit REST
// requests (see firebase-auth.functions.ts's ensureAuthClaim, the only
// caller) — no SDK, so nothing to break under bundling.
import { initializeApp, getApps, getApp, cert, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { SignJWT, importPKCS8 } from "jose";

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

type ServiceAccount = { project_id: string; client_email: string; private_key: string };

function getServiceAccount(): ServiceAccount {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_KEY environment variable.");
  }
  return JSON.parse(raw);
}

let cachedAccessToken: { token: string; expiresAt: number } | undefined;

// OAuth2 JWT-bearer flow (https://developers.google.com/identity/protocols/oauth2/service-account) —
// signs a short-lived assertion with the service account's private key and
// exchanges it for an access token scoped to the Identity Toolkit API.
// Cached in-module until shortly before expiry (tokens are valid 1h).
async function getGoogleAccessToken(): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }

  const serviceAccount = getServiceAccount();
  const privateKey = await importPKCS8(serviceAccount.private_key, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({
    scope: "https://www.googleapis.com/auth/identitytoolkit",
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(serviceAccount.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const json: any = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description ?? json.error ?? "Failed to get Google access token");
  }

  cachedAccessToken = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return cachedAccessToken.token;
}

async function identityToolkitRequest(path: string, body: unknown): Promise<any> {
  const accessToken = await getGoogleAccessToken();
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json: any = await res.json();
  if (!res.ok) {
    throw new Error(json.error?.message ?? "Identity Toolkit request failed");
  }
  return json;
}

export async function getFirebaseUserCustomClaims(uid: string): Promise<Record<string, unknown>> {
  const { project_id } = getServiceAccount();
  const json = await identityToolkitRequest(`projects/${project_id}/accounts:lookup`, { localId: [uid] });
  const raw = json.users?.[0]?.customAttributes;
  return raw ? JSON.parse(raw) : {};
}

export async function setFirebaseCustomClaims(uid: string, claims: Record<string, unknown>): Promise<void> {
  const { project_id } = getServiceAccount();
  await identityToolkitRequest(`projects/${project_id}/accounts:update`, {
    localId: uid,
    customAttributes: JSON.stringify(claims),
  });
}
