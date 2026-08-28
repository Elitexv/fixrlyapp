import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { signOut } from "firebase/auth";
import { firebaseAuth } from "@/integrations/firebase/client";
import { supabase } from "@/integrations/supabase/client";
import { useSession, useRoles } from "@/lib/session";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BottomNav } from "@/components/BottomNav";
import { AvatarUpload } from "@/components/AvatarUpload";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { LogOut, User, Briefcase, Shield, Palette, Sun, Moon, Laptop, Bell, BellOff, ChevronRight, ChevronLeft, ArrowRight } from "lucide-react";
import { Panel, Eyebrow, FormField, PrimaryButton, PageSpinner } from "@/components/ui-kit";
import { useTheme, type Theme } from "@/lib/theme";
import { getPushSubscriptionState, isPushSupported, subscribeToPush, unsubscribeFromPush } from "@/lib/push";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "My profile — Fixrly" }, { name: "robots", content: "noindex" }] }),
  component: ProfilePage,
});

type Section = "profile" | "notifications" | "theme" | "admin";
const sectionTitles: Record<Section, string> = {
  profile: "Profile",
  notifications: "Notifications",
  theme: "Appearance",
  admin: "Admin",
};

function ProfilePage() {
  const { user, loading: sessionLoading } = useSession();
  const { data: roles = [] } = useRoles(user);
  const isAdmin = roles.includes("admin");
  const isProvider = roles.includes("provider");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [section, setSection] = useState<Section>("profile");
  const { theme } = useTheme();

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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? "");
      setPhone(profile.phone ?? "");
    }
  }, [profile]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ full_name: fullName, phone }).eq("id", user!.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Profile updated");
    qc.invalidateQueries({ queryKey: ["profile", user!.id] });
  };

  const handleSignOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await signOut(firebaseAuth);
    navigate({ to: "/auth", replace: true });
  };

  if (sessionLoading || !user) {
    return <PageSpinner />;
  }

  return (
    <div className="min-h-screen bg-canvas pb-32">
      <header className="h-16 flex items-center gap-3 border-b border-soft bg-surface/90 backdrop-blur sticky top-0 z-20 px-4">
        {section !== "profile" ? (
          <button
            type="button"
            onClick={() => setSection("profile")}
            aria-label="Back"
            className="shrink-0 size-9 rounded-full bg-brand/5 grid place-items-center transition hover:bg-brand/10"
          >
            <ChevronLeft className="size-4" />
          </button>
        ) : null}
        <div className="flex-1 min-w-0">
          <Eyebrow>Account</Eyebrow>
          <h1 className="text-base font-black tracking-tight truncate">{sectionTitles[section]}</h1>
        </div>
        {section === "profile" && (
          <button
            type="button"
            onClick={handleSignOut}
            aria-label="Sign out"
            className="shrink-0 flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-wider text-brand/60 transition hover:bg-canvas hover:text-red-600"
          >
            <LogOut className="size-4" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        )}
      </header>

      <main className="px-4 py-6 max-w-3xl w-full mx-auto">
        {section === "profile" && (
          <div className="space-y-4">
            <Panel>
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                <AvatarUpload
                  userId={user!.id}
                  avatarUrl={profile?.avatar_url ?? null}
                  label={(user?.email?.[0] ?? "?").toUpperCase()}
                />
                <div className="min-w-0">
                  <h2 className="text-lg font-black tracking-tight">{profile?.full_name || "Welcome back"}</h2>
                  <p className="text-sm text-brand/60 truncate">{user?.email}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {roles.map((role) => (
                      <span key={role} className="rounded-full bg-accent/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-accent">
                        {role}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <form onSubmit={save} className="mt-6 space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Full name" required value={fullName} onChange={setFullName} />
                  <FormField label="Phone" value={phone} onChange={setPhone} />
                </div>
                <PrimaryButton disabled={saving} loading={saving} className="w-full">
                  Save profile
                </PrimaryButton>
              </form>
            </Panel>

            {/* Quick-access banner — one tap to the provider tools. */}
            <Link
              to={isProvider ? "/dashboard" : "/become-provider"}
              className="relative flex items-center gap-4 overflow-hidden rounded-[2rem] bg-[#0f172a] p-6 text-white shadow-soft transition hover:opacity-95"
            >
              <div className="pointer-events-none absolute -right-6 -top-8 size-32 rounded-full bg-accent/25" />
              <div className="relative grid size-12 shrink-0 place-items-center rounded-2xl bg-accent">
                <Briefcase className="size-5 text-white" />
              </div>
              <div className="relative min-w-0 flex-1">
                <div className="text-sm font-bold">{isProvider ? "Provider dashboard" : "Start earning today"}</div>
                <div className="text-xs text-white/60">
                  {isProvider ? "Manage jobs, staff & payouts" : "List your services and get booked"}
                </div>
              </div>
              <ArrowRight className="relative size-4 shrink-0 text-white/40" />
            </Link>

            {/* Grouped settings — icon-leading rows, drill into a section. */}
            <Panel className="p-0 overflow-hidden divide-y divide-soft">
              <button
                type="button"
                onClick={() => setSection("notifications")}
                className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-canvas"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
                  <Bell className="size-4" />
                </span>
                <span className="flex-1 text-sm font-semibold">Notifications</span>
                <ChevronRight className="size-4 text-brand/30" />
              </button>
              <button
                type="button"
                onClick={() => setSection("theme")}
                className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-canvas"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-purple-50 text-purple-600">
                  <Palette className="size-4" />
                </span>
                <span className="flex-1 text-sm font-semibold">Appearance</span>
                <span className="text-xs font-medium capitalize text-brand/40">{theme}</span>
                <ChevronRight className="size-4 text-brand/30" />
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setSection("admin")}
                  className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-canvas"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">
                    <Shield className="size-4" />
                  </span>
                  <span className="flex-1 text-sm font-semibold">Admin console</span>
                  <ChevronRight className="size-4 text-brand/30" />
                </button>
              )}
              <button
                type="button"
                onClick={handleSignOut}
                className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-canvas"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-red-50 text-red-600">
                  <LogOut className="size-4" />
                </span>
                <span className="flex-1 text-sm font-semibold text-red-600">Sign out</span>
              </button>
            </Panel>
          </div>
        )}

        {section === "notifications" && <NotificationsSection userId={user!.id} />}

        {section === "theme" && <ThemeSection />}

        {section === "admin" && isAdmin && (
          <Panel>
            <Eyebrow>Admin</Eyebrow>
            <h2 className="mt-2 text-lg font-black tracking-tight">Admin console</h2>
            <p className="mt-2 text-sm text-brand/60">Requests, users, payments, and platform settings.</p>
            <Link
              to="/admin"
              className="mt-4 inline-flex items-center gap-3 rounded-2xl bg-accent px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-accent/20 transition hover:bg-orange-500"
            >
              <Shield className="size-4" /> Open admin console
            </Link>
          </Panel>
        )}
      </main>

      <BottomNav />
    </div>
  );
}

function NotificationsSection({ userId }: { userId: string }) {
  const [state, setState] = useState<"loading" | "unsupported" | "denied" | "subscribed" | "unsubscribed">("loading");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    getPushSubscriptionState().then(setState);
  }, []);

  const enable = async () => {
    setWorking(true);
    try {
      await subscribeToPush(userId);
      setState("subscribed");
      toast.success("Push notifications enabled");
    } catch (err: any) {
      toast.error(err.message ?? "Couldn't enable push notifications");
      setState(await getPushSubscriptionState());
    } finally {
      setWorking(false);
    }
  };

  const disable = async () => {
    setWorking(true);
    try {
      await unsubscribeFromPush(userId);
      setState("unsubscribed");
      toast.success("Push notifications turned off");
    } catch (err: any) {
      toast.error(err.message ?? "Couldn't turn off push notifications");
    } finally {
      setWorking(false);
    }
  };

  return (
    <Panel>
      <Eyebrow>Push notifications</Eyebrow>
      <h2 className="mt-2 text-lg font-black tracking-tight">Stay in the loop</h2>
      <p className="mt-2 text-sm text-brand/60">
        Get notified the moment a booking is accepted, your provider is on the way, or a customer books you — even
        when Fixrly isn't open.
      </p>

      <div className="mt-5">
        {state === "loading" && <p className="text-sm text-brand/50">Checking status…</p>}

        {state === "unsupported" && (
          <p className="text-sm text-brand/50">Push notifications aren't supported in this browser.</p>
        )}

        {state === "denied" && (
          <p className="text-sm text-brand/50">
            Notifications are blocked for Fixrly in your browser settings. Allow them from your browser's site
            settings to turn this on.
          </p>
        )}

        {state === "unsubscribed" && (
          <button
            type="button"
            onClick={enable}
            disabled={working}
            className="inline-flex items-center gap-2 rounded-2xl bg-accent px-5 py-3 text-sm font-bold text-white shadow-lg shadow-accent/20 transition hover:bg-orange-500 disabled:opacity-60"
          >
            <Bell className="size-4" />
            {working ? "Enabling…" : "Enable push notifications"}
          </button>
        )}

        {state === "subscribed" && (
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1.5 text-xs font-bold text-accent">
              <Bell className="size-3.5" /> Enabled on this device
            </span>
            <button
              type="button"
              onClick={disable}
              disabled={working}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-brand/50 hover:text-red-600 disabled:opacity-60"
            >
              <BellOff className="size-3.5" />
              {working ? "Turning off…" : "Turn off"}
            </button>
          </div>
        )}
      </div>
    </Panel>
  );
}

const THEME_OPTIONS: { id: Theme; label: string; icon: typeof Sun }[] = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Laptop },
];

function ThemeSection() {
  const { theme, setTheme } = useTheme();

  return (
    <Panel>
      <Eyebrow>Appearance</Eyebrow>
      <h2 className="mt-2 text-lg font-black tracking-tight">Theme</h2>
      <p className="mt-2 text-sm text-brand/60">Choose how Fixrly looks on this device. Applies everywhere, instantly.</p>

      <div className="mt-5 grid grid-cols-3 gap-3">
        {THEME_OPTIONS.map(({ id, label, icon: Icon }) => {
          const active = theme === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTheme(id)}
              className={`flex flex-col items-center gap-2 rounded-2xl border p-4 text-sm font-bold transition ${
                active ? "border-accent bg-accent/5 text-accent" : "border-brand/10 text-brand/60 hover:border-brand/20"
              }`}
            >
              <Icon className="size-5" />
              {label}
            </button>
          );
        })}
      </div>
    </Panel>
  );
}
