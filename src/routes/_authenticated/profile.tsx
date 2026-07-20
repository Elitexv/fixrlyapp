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
    <div className="min-h-screen bg-canvas pb-28 lg:pl-72">
      <header className="relative overflow-hidden bg-gradient-to-br from-accent/20 via-brand/10 to-surface px-5 pt-8 pb-12">
        <div className="pointer-events-none absolute -right-16 top-6 h-44 w-44 rounded-full bg-accent/20 blur-3xl" />
        <div className="pointer-events-none absolute left-6 top-10 h-28 w-28 rounded-full bg-brand/10 blur-3xl" />
        <div className="max-w-5xl mx-auto">
          <p className="text-sm uppercase tracking-[0.28em] text-accent/70">Account</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight">My profile</h1>
          <p className="mt-3 max-w-2xl text-sm text-brand/60">
            Manage your account details, provider status, and quick actions from one polished view.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 -mt-10">
        <div className="grid gap-4 lg:grid-cols-[1.6fr_0.9fr]">
          <section className="rounded-[2rem] bg-white/95 border border-soft p-6 shadow-soft">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-accent/10 text-accent">
                  <User className="size-6" />
                </div>
                <h2 className="mt-4 text-lg font-semibold">Welcome back</h2>
                <p className="text-sm text-brand/60">{user?.email}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {roles.map((role) => (
                  <span key={role} className="rounded-full bg-accent/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-accent">
                    {role}
                  </span>
                ))}
              </div>
            </div>

            <form onSubmit={save} className="mt-6 space-y-5">
              <div className="grid gap-4 lg:grid-cols-2">
                <Field label="Full name" required value={fullName} onChange={(v) => setFullName(v)} />
                <Field label="Phone" value={phone} onChange={(v) => setPhone(v)} />
              </div>

              <button disabled={loading} className="w-full rounded-2xl bg-accent px-4 py-3 text-sm font-bold text-white shadow-lg shadow-accent/20 transition hover:bg-orange-500 disabled:opacity-60 flex items-center justify-center gap-2">
                {loading && <Loader2 className="size-4 animate-spin" />}
                Save profile
              </button>
            </form>
          </section>

          <aside className="space-y-4">
            <div className="rounded-[2rem] bg-white/95 border border-soft p-6 shadow-soft">
              <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-brand/60">Action Center</h2>
              <p className="mt-3 text-sm text-brand/60">A single place to check your provider status and account tools.</p>
              <div className="mt-5 space-y-4">
                {!roles.includes("provider") ? (
                  <Link to="/become-provider" className="block rounded-2xl bg-brand px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand/10 text-center transition hover:bg-brand/90">
                    Become a provider
                  </Link>
                ) : (
                  <div className="rounded-3xl bg-brand/5 p-4 text-sm text-brand/70">
                    <div className="font-semibold">Provider mode active</div>
                    <p className="mt-2 text-sm text-brand/60">You can edit your listing details from the dashboard and accept bookings instantly.</p>
                  </div>
                )}
              </div>
            </div>

            <button type="button" onClick={signOut} className="w-full rounded-2xl border border-red-200 bg-white px-4 py-3 text-sm font-bold text-red-600 transition hover:bg-red-50 flex items-center justify-center gap-2">
              <LogOut className="size-4" /> Sign out
            </button>
          </aside>
        </div>

        {!roles.includes("provider") && (
          <div className="mt-4 rounded-[2rem] bg-white/95 border border-soft p-6 shadow-soft">
            <h3 className="text-base font-semibold">Start earning today</h3>
            <p className="mt-2 text-sm text-brand/60">
              Create a provider listing to show customers your services, availability, and pricing.
            </p>
            <Link to="/become-provider" className="mt-4 inline-flex rounded-2xl bg-accent px-5 py-3 text-sm font-bold text-white shadow-lg shadow-accent/20 transition hover:bg-orange-500">
              Launch provider profile
            </Link>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
  textarea,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  textarea?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase text-brand/40">{label}{required && " *"}</span>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          placeholder={placeholder}
          required={required}
          className="mt-1 w-full rounded-3xl border border-brand/10 bg-canvas px-4 py-3 text-sm text-brand outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/10 resize-none"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          className="mt-1 w-full rounded-3xl border border-brand/10 bg-canvas px-4 py-3 text-sm text-brand outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/10"
        />
      )}
    </label>
  );
}