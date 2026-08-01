import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { waitForSupabaseSession } from "@/lib/session";
import { PageSpinner, PrimaryButton } from "@/components/ui-kit";

type Search = { redirect?: string };

export const Route = createFileRoute("/auth/callback")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    redirect: typeof s.redirect === "string" ? s.redirect : undefined,
  }),
  head: () => ({ meta: [{ title: "Signing in — Fixrly" }, { name: "robots", content: "noindex" }] }),
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const session = await waitForSupabaseSession(10, 300);
      if (cancelled) return;
      if (!session) {
        setFailed(true);
        return;
      }
      navigate({ to: redirect && redirect.startsWith("/") ? redirect : "/", replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, redirect]);

  if (failed) {
    return (
      <div className="min-h-screen bg-canvas grid place-items-center px-4 text-center">
        <div>
          <h1 className="text-xl font-black">Sign-in link expired</h1>
          <p className="text-sm text-brand/60 mt-2">Please request a new confirmation email and try again.</p>
          <PrimaryButton onClick={() => navigate({ to: "/auth" })} className="mt-4 inline-flex">
            Back to sign in
          </PrimaryButton>
        </div>
      </div>
    );
  }

  return <PageSpinner />;
}
