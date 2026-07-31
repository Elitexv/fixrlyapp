import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { waitForSupabaseSession } from "@/lib/session";
import { toast } from "sonner";
import { PrimaryButton, TextField } from "@/components/ui-kit";

type Search = { redirect?: string };

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    redirect: typeof s.redirect === "string" ? s.redirect : undefined,
  }),
  head: () => ({ meta: [{ title: "Sign in — Nearby" }, { name: "robots", content: "noindex" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { redirect } = useSearch({ from: "/auth" });
  const goNext = () => navigate({ to: redirect && redirect.startsWith("/") ? redirect : "/" });

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
      const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
      if (result.error) return toast.error(result.error.message);
      if (result.redirected) return;

      await waitForSupabaseSession(6, 250);
      goNext();
    } catch (err: any) {
      toast.error(err.message ?? "Google sign-in failed");
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });
      if (error) throw error;
      setResetSent(true);
    } catch (err: any) {
      toast.error(err.message ?? "Could not send reset email");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        console.log("[Auth] Signing up with email:", email);
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          phone: phone || undefined,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            data: { full_name: fullName, role, phone },
          },
        });
        if (error) {
          console.error("[Auth] Signup error:", error);
          throw error;
        }

        console.log("[Auth] Signup successful, session:", data.session ? "yes" : "no", "user_confirmed:", data.user?.user_metadata?.email_verified);
        
        if (!data.session) {
          toast.success("Account created! Check your email to confirm, then sign in.");
          setMode("signin");
          setEmail("");
          setPassword("");
          return;
        }

        await waitForSupabaseSession(6, 250);
        toast.success("Account created");
        goNext();
      } else {
        console.log("[Auth] Signing in with email:", email);
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          console.error("[Auth] Sign-in error:", error);
          throw error;
        }
        if (!data.session) {
          console.error("[Auth] No session after sign-in");
          throw new Error("We couldn't start your session. Please try again.");
        }

        console.log("[Auth] Sign-in successful, waiting for session...");
        await waitForSupabaseSession(6, 250);
        toast.success("Signed in");
        goNext();
      }
    } catch (err: any) {
      console.error("[Auth] Error:", err);
      toast.error(err.message ?? "Failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas grid place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="inline-flex size-12 rounded-2xl bg-accent grid place-items-center text-white font-black text-xl shadow-lg shadow-accent/30">N</div>
          <h1 className="mt-3 text-2xl font-black tracking-tight">
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

        <div className="light-surface bg-white/95 p-6 rounded-[2rem] border border-soft shadow-soft space-y-4">
          {mode !== "forgot" && (
            <>
              <button
                onClick={handleGoogle}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-brand/10 rounded-xl text-sm font-semibold transition hover:bg-canvas"
              >
                <svg className="size-4" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.4 5.4 2.5 13.2l7.8 6.1C12.3 13.2 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.6c0-1.7-.2-3.3-.5-4.9H24v9.3h12.7c-.6 3-2.3 5.5-4.9 7.2l7.6 5.9c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.3 28.7c-.5-1.5-.8-3.1-.8-4.7s.3-3.2.8-4.7l-7.8-6.1C.8 16.5 0 20.1 0 24s.8 7.5 2.5 10.8l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.7-3.7-13.7-8.9l-7.8 6.1C6.4 42.6 14.6 48 24 48z"/></svg>
                Continue with Google
              </button>

              <div className="flex items-center gap-3">
                <div className="h-px bg-border flex-1" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-brand/40">or</span>
                <div className="h-px bg-border flex-1" />
              </div>
            </>
          )}

          {mode === "forgot" ? (
            resetSent ? (
              <div className="text-center py-2">
                <p className="text-sm text-brand/70">
                  If an account exists for <span className="font-semibold">{email}</span>, a reset link is on its way. Check your inbox (and spam folder).
                </p>
                <button
                  onClick={() => { setMode("signin"); setResetSent(false); }}
                  className="mt-4 text-accent font-bold text-xs uppercase tracking-wider"
                >
                  Back to sign in
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-3">
                <TextField
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  required
                />
                <PrimaryButton type="submit" loading={loading} className="w-full">
                  Send reset link
                </PrimaryButton>
                <div className="text-center text-xs text-brand/60">
                  <button type="button" onClick={() => setMode("signin")} className="text-accent font-bold">
                    Back to sign in
                  </button>
                </div>
              </form>
            )
          ) : (
          <>
          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === "signup" && (
              <>
                <TextField value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" required />
                <TextField value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (optional)" type="tel" />
              </>
            )}
            <TextField type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required />
            <TextField
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
              minLength={6}
            />
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
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRole("customer")}
                  className={`py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider border transition ${role === "customer" ? "bg-primary text-primary-foreground border-primary" : "bg-canvas border-brand/10 hover:border-brand/20"}`}
                >
                  I need services
                </button>
                <button
                  type="button"
                  onClick={() => setRole("provider")}
                  className={`py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider border transition ${role === "provider" ? "bg-primary text-primary-foreground border-primary" : "bg-canvas border-brand/10 hover:border-brand/20"}`}
                >
                  I offer services
                </button>
              </div>
            )}

            <PrimaryButton type="submit" loading={loading} className="w-full">
              {mode === "signin" ? "Sign in" : "Create account"}
            </PrimaryButton>
          </form>

          <div className="text-center text-xs text-brand/60">
            {mode === "signin" ? "New to Nearby?" : "Already have an account?"}{" "}
            <button
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="text-accent font-bold"
            >
              {mode === "signin" ? "Create account" : "Sign in"}
            </button>
          </div>
          </>
          )}
        </div>
      </div>
    </div>
  );
}
