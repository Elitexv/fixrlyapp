import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { waitForSupabaseSession } from "@/lib/session";
import { toast } from "sonner";
import { PageSpinner, PrimaryButton, TextField } from "@/components/ui-kit";

export const Route = createFileRoute("/auth/reset-password")({
  head: () => ({ meta: [{ title: "Reset password — Fixrly" }, { name: "robots", content: "noindex" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const session = await waitForSupabaseSession(10, 300);
      if (cancelled) return;
      if (!session) {
        setFailed(true);
        return;
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return toast.error("Password must be at least 6 characters");
    if (password !== confirm) return toast.error("Passwords don't match");
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated");
      navigate({ to: "/", replace: true });
    } catch (err: any) {
      toast.error(err.message ?? "Could not update password");
    } finally {
      setLoading(false);
    }
  };

  if (failed) {
    return (
      <div className="min-h-screen bg-canvas grid place-items-center px-4 text-center">
        <div>
          <h1 className="text-xl font-black">Reset link expired</h1>
          <p className="text-sm text-brand/60 mt-2">Please request a new password reset link and try again.</p>
          <PrimaryButton onClick={() => navigate({ to: "/auth" })} className="mt-4 inline-flex">
            Back to sign in
          </PrimaryButton>
        </div>
      </div>
    );
  }

  if (!ready) {
    return <PageSpinner />;
  }

  return (
    <div className="min-h-screen bg-canvas grid place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <img src="/icon.png" alt="Fixrly" className="inline-block size-12" />
          <h1 className="mt-3 text-2xl font-black tracking-tight">Set a new password</h1>
          <p className="text-sm text-brand/60 mt-1">Choose a new password for your account.</p>
        </div>

        <div className="light-surface bg-white/95 p-6 rounded-[2rem] border border-soft shadow-soft">
          <form onSubmit={submit} className="space-y-3">
            <TextField
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password"
              required
              minLength={6}
            />
            <TextField
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm new password"
              required
              minLength={6}
            />
            <PrimaryButton type="submit" loading={loading} className="w-full">
              Update password
            </PrimaryButton>
          </form>
        </div>
      </div>
    </div>
  );
}
