import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from "firebase/auth";
import type { User as FirebaseUser } from "firebase/auth";
import { firebaseAuth, googleProvider } from "@/integrations/firebase/client";
import { supabase } from "@/integrations/supabase/client";
import { safeRedirectPath } from "@/lib/session";
import { ensureAuthClaim } from "@/lib/firebase-auth.functions";
import { toast } from "sonner";
import { Mail, Lock, User as UserIcon, Phone, Home, Briefcase, ChevronLeft, MapPin, ShieldCheck, Zap } from "lucide-react";
import { PrimaryButton } from "@/components/ui-kit";

type Search = { redirect?: string };

// Firebase's JS SDK (v9.6.2+) collapses "no such user" and "wrong password"
// into one auth/invalid-credential code for both sign-in methods, for
// security reasons (doesn't reveal which part was wrong) — but that also
// hides the single most common real cause during the Supabase Auth ->
// Firebase Auth cutover: pre-migration accounts that only ever existed in
// Supabase and have no Firebase counterpart. err.message otherwise surfaces
// the raw "Firebase: Error (auth/...)" string verbatim, which isn't
// actionable for an end user.
function friendlyAuthError(err: any): string {
  switch (err?.code) {
    case "auth/invalid-credential":
      return "Incorrect email or password. If you had an account before our recent update, please create a new one.";
    case "auth/email-already-in-use":
      return "An account with this email already exists — try signing in instead.";
    case "auth/weak-password":
      return "Password must be at least 6 characters.";
    case "auth/invalid-email":
      return "That doesn't look like a valid email address.";
    case "auth/too-many-requests":
      return "Too many attempts — please wait a moment and try again.";
    case "auth/network-request-failed":
      return "Network error — check your connection and try again.";
    default:
      return err?.message ?? "Something went wrong. Please try again.";
  }
}

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    redirect: typeof s.redirect === "string" ? s.redirect : undefined,
  }),
  head: () => ({ meta: [{ title: "Sign in — Fixrly" }, { name: "robots", content: "noindex" }] }),
  component: AuthPage,
});

// Runs after every successful Firebase sign-in (signup, signin, Google) —
// idempotent throughout, safe to call every time, not just the first:
//   1. Make sure the token carries the `role: authenticated` custom claim
//      Supabase's Third-Party Auth requires to route requests to the
//      `authenticated` Postgres role (Firebase doesn't set this itself).
//   2. Force-refresh the ID token so *this* sign-in's token actually has
//      the claim, not just the next one.
//   3. Seed/refresh profiles + user_roles via ensure_profile — no-ops
//      (fills-if-empty) after the first call.
async function completeSignIn(user: FirebaseUser, opts: { fullName?: string | null; avatarUrl?: string | null; phone?: string | null; role: "customer" | "provider"; email: string | null }) {
  await ensureAuthClaim();
  await user.getIdToken(true);

  // Supabase's codegen doesn't mark these text params nullable even though
  // ensure_profile's SQL signature accepts NULL for all of them — same gap
  // as the admin_settings `as any` casts elsewhere in this codebase.
  const { error } = await supabase.rpc("ensure_profile", {
    p_full_name: opts.fullName ?? null,
    p_avatar_url: opts.avatarUrl ?? null,
    p_phone: opts.phone ?? null,
    p_role: opts.role,
    p_email: opts.email,
  } as any);
  if (error) throw error;
}

const fieldWrap = "light-surface flex items-center gap-2.5 bg-white rounded-2xl py-3 px-3.5 shadow-soft transition focus-within:ring-2 focus-within:ring-accent/30";
const fieldInput = "w-full bg-transparent text-sm outline-none placeholder:text-brand/40";

const HIGHLIGHTS = [
  { icon: MapPin, text: "Book vetted local pros in minutes" },
  { icon: Zap, text: "Live tracking when they're on the way" },
  { icon: ShieldCheck, text: "Secure payments, every time" },
];

function AuthPage() {
  const navigate = useNavigate();
  const { redirect } = useSearch({ from: "/auth" });
  const goNext = () => navigate({ to: safeRedirectPath(redirect) });

  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [role, setRole] = useState<"customer" | "provider">("customer");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleGoogle = async () => {
    try {
      const result = await signInWithPopup(firebaseAuth, googleProvider);
      await completeSignIn(result.user, {
        fullName: result.user.displayName,
        avatarUrl: result.user.photoURL,
        role: "customer",
        email: result.user.email,
      });
      goNext();
    } catch (err: any) {
      if (err?.code === "auth/popup-closed-by-user") return;
      toast.error(friendlyAuthError(err));
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await sendPasswordResetEmail(firebaseAuth, email, {
        url: `${window.location.origin}/auth/reset-password`,
        handleCodeInApp: true,
      });
      setResetSent(true);
    } catch (err: any) {
      toast.error(friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const cred = await createUserWithEmailAndPassword(firebaseAuth, email, password);
        if (fullName) await updateProfile(cred.user, { displayName: fullName });
        void sendEmailVerification(cred.user).catch(() => {});
        await completeSignIn(cred.user, { fullName, phone, role, email: cred.user.email });
        toast.success("Account created");
        goNext();
      } else {
        const cred = await signInWithEmailAndPassword(firebaseAuth, email, password);
        await completeSignIn(cred.user, { fullName: cred.user.displayName, phone: null, role: "customer", email: cred.user.email });
        toast.success("Signed in");
        goNext();
      }
    } catch (err: any) {
      toast.error(friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas lg:flex">
      {/* Branded panel — desktop only. Real, current features, not filler. */}
      <div className="relative hidden overflow-hidden bg-[#0f172a] px-12 py-14 text-white lg:flex lg:w-[42%] lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -left-24 -top-24 size-80 rounded-full bg-accent/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-0 size-96 rounded-full bg-accent/10 blur-3xl" />

        <div className="relative flex items-center gap-2.5">
          <img src="/icon.png" alt="" className="size-8" />
          <span className="text-lg font-black tracking-tight">Fixrly</span>
        </div>

        <div className="relative">
          <h2 className="text-3xl font-black leading-tight tracking-tight">
            Local service pros,<br />booked in minutes.
          </h2>
          <div className="mt-8 space-y-4">
            {HIGHLIGHTS.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/10">
                  <Icon className="size-4" />
                </span>
                <span className="text-sm font-medium text-white/80">{text}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-white/40">&copy; {new Date().getFullYear()} Fixrly</p>
      </div>

      {/* Form */}
      <div className="grid flex-1 place-items-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center lg:hidden">
            <img src="/icon.png" alt="Fixrly" className="inline-block size-12" />
          </div>

          {mode === "forgot" ? (
            <button
              type="button"
              onClick={() => { setMode("signin"); setResetSent(false); }}
              className="mb-4 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-brand/50 hover:text-brand"
            >
              <ChevronLeft className="size-3.5" /> Back to sign in
            </button>
          ) : (
            <div className="mx-auto mb-6 flex max-w-[280px] gap-1 rounded-2xl bg-brand/5 p-1.5">
              <button
                type="button"
                onClick={() => setMode("signin")}
                className={`flex-1 rounded-xl py-2 text-xs font-bold uppercase tracking-wider transition ${mode === "signin" ? "light-surface bg-white text-brand shadow-soft" : "text-brand/50 hover:text-brand/70"}`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => setMode("signup")}
                className={`flex-1 rounded-xl py-2 text-xs font-bold uppercase tracking-wider transition ${mode === "signup" ? "light-surface bg-white text-brand shadow-soft" : "text-brand/50 hover:text-brand/70"}`}
              >
                Sign up
              </button>
            </div>
          )}

          <div className="text-center mb-6">
            <h1 className="text-2xl font-black tracking-tight">
              {mode === "signin" ? "Welcome back" : mode === "signup" ? "Create your account" : "Reset your password"}
            </h1>
            <p className="text-sm text-brand/60 mt-1">
              {mode === "signin"
                ? "Sign in to book & manage services."
                : mode === "signup"
                  ? "Book pros, or list your services."
                  : "We'll email you a link to set a new password."}
            </p>
          </div>

          {mode === "forgot" ? (
            resetSent ? (
              <div className="light-surface rounded-[2rem] bg-white p-6 text-center shadow-soft">
                <p className="text-sm text-brand/70">
                  If an account exists for <span className="font-semibold">{email}</span>, a reset link is on its way. Check your inbox (and spam folder).
                </p>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-3">
                <div className={fieldWrap}>
                  <Mail className="size-4 shrink-0 text-brand/40" />
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required className={fieldInput} />
                </div>
                <PrimaryButton type="submit" loading={loading} className="w-full">
                  Send reset link
                </PrimaryButton>
              </form>
            )
          ) : (
            <div className="space-y-4">
              <button
                onClick={handleGoogle}
                className="light-surface flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold shadow-soft transition hover:bg-canvas"
              >
                <svg className="size-4" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.4 5.4 2.5 13.2l7.8 6.1C12.3 13.2 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.6c0-1.7-.2-3.3-.5-4.9H24v9.3h12.7c-.6 3-2.3 5.5-4.9 7.2l7.6 5.9c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.3 28.7c-.5-1.5-.8-3.1-.8-4.7s.3-3.2.8-4.7l-7.8-6.1C.8 16.5 0 20.1 0 24s.8 7.5 2.5 10.8l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.7-3.7-13.7-8.9l-7.8 6.1C6.4 42.6 14.6 48 24 48z"/></svg>
                Continue with Google
              </button>

              <div className="flex items-center gap-3">
                <div className="h-px bg-border flex-1" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-brand/40">or</span>
                <div className="h-px bg-border flex-1" />
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                {mode === "signup" && (
                  <>
                    <div className={fieldWrap}>
                      <UserIcon className="size-4 shrink-0 text-brand/40" />
                      <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" required className={fieldInput} />
                    </div>
                    <div className={fieldWrap}>
                      <Phone className="size-4 shrink-0 text-brand/40" />
                      <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (optional)" type="tel" className={fieldInput} />
                    </div>
                  </>
                )}
                <div className={fieldWrap}>
                  <Mail className="size-4 shrink-0 text-brand/40" />
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required className={fieldInput} />
                </div>
                <div className={fieldWrap}>
                  <Lock className="size-4 shrink-0 text-brand/40" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    required
                    minLength={6}
                    className={fieldInput}
                  />
                </div>
                {mode === "signin" && (
                  <div className="text-right -mt-1">
                    <button
                      type="button"
                      onClick={() => { setMode("forgot"); setResetSent(false); }}
                      className="text-xs font-semibold text-brand/50 hover:text-accent"
                    >
                      Forgot password?
                    </button>
                  </div>
                )}

                {mode === "signup" && (
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setRole("customer")}
                      className={`flex flex-col items-center gap-2 rounded-2xl border-2 py-4 text-xs font-bold uppercase tracking-wider transition ${role === "customer" ? "border-accent bg-accent/5 text-accent" : "light-surface border-transparent bg-white text-brand/60 shadow-soft hover:text-brand"}`}
                    >
                      <Home className="size-5" />
                      I need services
                    </button>
                    <button
                      type="button"
                      onClick={() => setRole("provider")}
                      className={`flex flex-col items-center gap-2 rounded-2xl border-2 py-4 text-xs font-bold uppercase tracking-wider transition ${role === "provider" ? "border-accent bg-accent/5 text-accent" : "light-surface border-transparent bg-white text-brand/60 shadow-soft hover:text-brand"}`}
                    >
                      <Briefcase className="size-5" />
                      I offer services
                    </button>
                  </div>
                )}

                <PrimaryButton type="submit" loading={loading} className="w-full">
                  {mode === "signin" ? "Sign in" : "Create account"}
                </PrimaryButton>
              </form>

              <p className="text-center text-[11px] leading-relaxed text-brand/40">
                Protected by reCAPTCHA and subject to the Google{" "}
                <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer" className="underline hover:text-brand/60">Privacy Policy</a>{" "}
                and{" "}
                <a href="https://policies.google.com/terms" target="_blank" rel="noreferrer" className="underline hover:text-brand/60">Terms of Service</a>.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
