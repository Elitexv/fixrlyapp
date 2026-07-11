import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useSession, useRoles } from "@/lib/session";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BottomNav } from "@/components/BottomNav";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { LogOut, Loader2, User } from "lucide-react";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "My profile — Nearby" }, { name: "robots", content: "noindex" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user } = useSession();
  const { data: roles = [] } = useRoles(user);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? "");
      setPhone(profile.phone ?? "");
    }
  }, [profile]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.from("profiles").update({ full_name: fullName, phone }).eq("id", user!.id);
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Profile updated");
    qc.invalidateQueries({ queryKey: ["profile", user!.id] });
  };


  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen bg-canvas pb-24">
      <header className="bg-surface border-b border-brand/5 px-4 pt-6 pb-4">
        <h1 className="text-xl font-black">My profile</h1>
        <p className="text-xs text-brand/60 mt-1 truncate">{user?.email}</p>
        <div className="flex gap-2 mt-2 flex-wrap">
          {roles.map((r) => (
            <span key={r} className="text-[10px] font-bold uppercase px-2 py-1 rounded bg-brand/5">{r}</span>
          ))}
        </div>
      </header>

      <form onSubmit={save} className="px-4 py-4 space-y-3">
        <div className="bg-surface p-4 rounded-2xl border border-brand/5 shadow-sm space-y-3">
          <label className="block">
            <span className="text-[10px] font-bold uppercase text-brand/40">Full name</span>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-1 w-full bg-canvas rounded-xl py-2.5 px-3 text-sm outline-none" />
          </label>
          <label className="block">
            <span className="text-[10px] font-bold uppercase text-brand/40">Phone</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 w-full bg-canvas rounded-xl py-2.5 px-3 text-sm outline-none" />
          </label>
          <button disabled={loading} className="w-full py-3 bg-accent text-white rounded-xl text-sm font-bold shadow-lg shadow-accent/20 disabled:opacity-60 flex items-center justify-center gap-2">
            {loading && <Loader2 className="size-4 animate-spin" />}
            Save
          </button>
        </div>

        {!roles.includes("provider") && (
          <div className="bg-surface p-4 rounded-2xl border border-brand/5 shadow-sm">
            <h3 className="font-bold">Become a service provider</h3>
            <p className="text-xs text-brand/60 mt-1">List your services and start accepting bookings.</p>
            <Link to="/become-provider" className="mt-3 w-full py-2.5 border-2 border-brand rounded-xl text-sm font-bold flex items-center justify-center">
              Get started
            </Link>
          </div>
        )}

        <button type="button" onClick={signOut} className="w-full py-3 rounded-xl border border-red-200 text-red-600 text-sm font-bold flex items-center justify-center gap-2">
          <LogOut className="size-4" /> Sign out
        </button>
      </form>

      <BottomNav />
    </div>
  );
}
