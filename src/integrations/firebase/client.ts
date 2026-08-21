import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Vite HMR / TanStack Start SSR can re-evaluate this module more than once
// per runtime; initializeApp() throws "already exists" on a second call.
const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const firebaseAuth = getAuth(firebaseApp);
export const googleProvider = new GoogleAuthProvider();

// App Check (reCAPTCHA v3) — invisible bot/abuse protection for sign-up,
// sign-in, and password reset. Browser-only (ReCaptchaV3Provider needs the
// DOM to load the reCAPTCHA script) and only once the site key exists —
// stays inert until VITE_RECAPTCHA_SITE_KEY is set, so it can't break the
// app before App Check is actually configured in the Firebase Console.
//
// Local dev needs a debug token instead of a real reCAPTCHA challenge (see
// Firebase Console -> App Check -> Debug tokens per Supabase's Third-Party
// Auth setup notes elsewhere in this repo for the equivalent one-time step):
// this logs the token to the console on first run in dev — register it
// there once, or App Check enforcement will reject local requests.
if (typeof window !== "undefined" && import.meta.env.VITE_RECAPTCHA_SITE_KEY) {
  if (import.meta.env.DEV) {
    (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  initializeAppCheck(firebaseApp, {
    provider: new ReCaptchaV3Provider(import.meta.env.VITE_RECAPTCHA_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
}
