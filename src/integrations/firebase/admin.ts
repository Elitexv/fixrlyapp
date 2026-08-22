// Server-only Firebase admin operations. Never import this from a route
// file or *.functions.ts — those ship to the client bundle. Load it inside
// server handlers only, e.g.:
//   const { verifyFirebaseIdToken } = await import("@/integrations/firebase/admin");
//
// Deliberately does NOT use the firebase-admin package. Confirmed via a
// live repro against the deployed app: merely importing firebase-admin/app
// or firebase-admin/auth in a request-time code path (even just to verify
// a token — nothing SDK-specific was actually called yet) throws "Cannot
// read properties of undefined (reading 'SDK_VERSION')" once Vite's SSR
// build rolls it into a single ESM chunk — its internals depend on Node's
// CommonJS require()/__dirname resolution, which doesn't survive that.
// Everything below is implemented as plain REST calls / local JWT
// verification instead, using `jose` (built on Web Crypto, no CJS
// internals to break under bundling).
import { SignJWT, importPKCS8, createRemoteJWKSet, jwtVerify } from "jose";

type ServiceAccount = { project_id: string; client_email: string; private_key: string };

function getServiceAccount(): ServiceAccount {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_KEY environment variable.");
  }
  return JSON.parse(raw);
}

// Google's actual JWKS endpoint for Firebase ID tokens (not the x509 cert
// endpoint firebase-admin uses internally — this one is real JWKS format,
// consumable directly by jose). Cached/rotated automatically by jose.
const firebaseJwks = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

export async function verifyFirebaseIdToken(token: string): Promise<{ uid: string } & Record<string, unknown>> {
  const { project_id } = getServiceAccount();
  const { payload } = await jwtVerify(token, firebaseJwks, {
    issuer: `https://securetoken.google.com/${project_id}`,
    audience: project_id,
  });

  // jwtVerify already checked signature/exp/iat/iss/aud. Firebase's own
  // verification recipe additionally requires sub non-empty and auth_time
  // in the past — see https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library
  if (!payload.sub) {
    throw new Error("Invalid Firebase ID token: missing subject");
  }
  if (typeof payload.auth_time !== "number" || payload.auth_time > Date.now() / 1000 + 5) {
    throw new Error("Invalid Firebase ID token: auth_time in the future");
  }

  return { ...payload, uid: payload.sub };
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
