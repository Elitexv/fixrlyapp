import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getFirebaseUserOrNull } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Briefcase, Loader2 } from "lucide-react";
import { PrimaryButton } from "@/components/ui-kit";

// Outside _authenticated on purpose — an invitee may not have an account
// yet. No invite-preview step: provider_staff RLS only lets the owner (or
// the eventual claimant, once claimed) read a row, so there's no safe way
// to show "you've been invited to X" before sign-in without a dedicated
// preview RPC this first slice doesn't add — knowing the token is itself
// the authorization, same as any shareable invite link.
export const Route = createFileRoute("/join-team/$token")({
  head: () => ({ meta: [{ title: "Join your team — Fixrly" }, { name: "robots", content: "noindex" }] }),
  component: JoinTeamPage,
});

function JoinTeamPage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"checking" | "needs-auth" | "claiming" | "error">("checking");
  const [error, setError] = useState("");

  useEffect(() => {
    getFirebaseUserOrNull().then((user) => {
      if (!user) {
        setStatus("needs-auth");
      } else {
        claim();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const claim = async () => {
    setStatus("claiming");
    const { error: claimError } = await supabase.rpc("claim_staff_invite", { _token: token });
    if (claimError) {
      setError(claimError.message);
      setStatus("error");
      return;
    }
    toast.success("You've joined the team!");
    navigate({ to: "/business" });
  };

  return (
    <div className="min-h-screen bg-canvas grid place-items-center px-6 text-center">
      <div className="max-w-sm">
        <div className="mx-auto size-14 rounded-2xl bg-accent grid place-items-center text-white shadow-lg shadow-accent/20 mb-4">
          <Briefcase className="size-6" />
        </div>
        <h1 className="text-xl font-black tracking-tight">Join your team</h1>

        {status === "checking" && <Loader2 className="size-5 animate-spin mx-auto mt-4 text-brand/40" />}

        {status === "needs-auth" && (
          <>
            <p className="text-sm text-brand/60 mt-2">Sign in or create an account to join, then come back to this link.</p>
            <PrimaryButton
              className="mt-4 w-full"
              onClick={() => navigate({ to: "/auth", search: { redirect: `/join-team/${token}` } })}
            >
              Continue
            </PrimaryButton>
          </>
        )}

        {status === "claiming" && (
          <>
            <p className="text-sm text-brand/60 mt-2">Joining…</p>
            <Loader2 className="size-5 animate-spin mx-auto mt-4 text-brand/40" />
          </>
        )}

        {status === "error" && (
          <>
            <p className="text-sm text-red-600 mt-2">{error}</p>
            <PrimaryButton className="mt-4 w-full" onClick={() => navigate({ to: "/" })}>
              Go home
            </PrimaryButton>
          </>
        )}
      </div>
    </div>
  );
}
