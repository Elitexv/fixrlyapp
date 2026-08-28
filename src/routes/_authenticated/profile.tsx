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
import { LogOut, User, Briefcase, Shield, Home, Palette, Sun, Moon, Laptop, Bell, BellOff, ChevronRight, ArrowRight } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { Panel, Eyebrow, FormField, PrimaryButton, PageSpinner, useNeutralSidebarSurface } from "@/components/ui-kit";
import { useTheme, type Theme } from "@/lib/theme";
import { getPushSubscriptionState, isPushSupported, subscribeToPush, unsubscribeFromPush } from "@/lib/push";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "My profile — Fixrly" }, { name: "robots", content: "noindex" }] }),
  component: ProfilePage,
});

type Section = "profile" | "provider" | "notifications" | "theme" | "admin";

function ProfilePage() {
  const { user, loading: sessionLoading } = useSession();
  const { data: roles = [] } = useRoles(user);
  const isAdmin = roles.includes("admin");
  const isProvider = roles.includes("provider");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [section, setSection] = useState<Section>("profile");
  const { theme } = useTheme();
  useNeutralSidebarSurface();

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

  const sections = [
    { id: "profile" as const, label: "Profile", icon: User },
    { id: "provider" as const, label: "Provider", icon: Briefcase },
    { id: "notifications" as const, label: "Notifications", icon: Bell },
    { id: "theme" as const, label: "Theme", icon: Palette },
    ...(isAdmin ? [{ id: "admin" as const, label: "Admin", icon: Shield }] : []),
  ];

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-canvas">
        <ProfileSidebarNav section={section} setSection={setSection} sections={sections} onSignOut={handleSignOut} />

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-16 flex items-center gap-3 border-b border-soft bg-surface/90 backdrop-blur sticky top-0 z-20 px-4">
            <SidebarTrigger />
            <div className="flex-1 min-w-0">
              <Eyebrow>Account</Eyebrow>
              <h1 className="text-base font-black tracking-tight truncate">{sections.find((s) => s.id === section)?.label}</h1>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              aria-label="Sign out"
              className="shrink-0 flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-wider text-brand/60 transition hover:bg-canvas hover:text-red-600"
            >
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </header>

          <main className="flex-1 px-4 py-6 pb-28 max-w-3xl w-full mx-auto">
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

                {/* Quick-access banner — one tap to the provider tools, no
                    need to hunt through the sidebar for it. */}
                <Link
                  to={isProvider ? "/dashboard" : "/become-provider"}
                  className="relative flex items-center gap-4 overflow-hidden rounded-[2rem] bg-brand p-6 text-brand-foreground shadow-soft transition hover:opacity-95"
                >
                  <div className="pointer-events-none absolute -right-6 -top-8 size-32 rounded-full bg-accent/25" />
                  <div className="relative grid size-12 shrink-0 place-items-center rounded-2xl bg-accent">
                    <Briefcase className="size-5 text-white" />
                  </div>
                  <div className="relative min-w-0 flex-1">
                    <div className="text-sm font-bold">{isProvider ? "Provider dashboard" : "Start earning today"}</div>
                    <div className="text-xs text-brand-foreground/60">
                      {isProvider ? "Manage jobs, staff & payouts" : "List your services and get booked"}
                    </div>
                  </div>
                  <ArrowRight className="relative size-4 shrink-0 text-brand-foreground/40" />
                </Link>

                {/* Grouped settings — icon-leading rows, jump straight to a section. */}
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

            {section === "provider" && (
              <Panel>
                <Eyebrow>Provider status</Eyebrow>
                {!isProvider ? (
                  <>
                    <h2 className="mt-2 text-lg font-black tracking-tight">Start earning today</h2>
                    <p className="mt-2 text-sm text-brand/60">
                      Create a provider listing to show customers your services, availability, and pricing.
                    </p>
                    <Link to="/become-provider" className="mt-4 inline-flex rounded-2xl bg-accent px-5 py-3 text-sm font-bold text-white shadow-lg shadow-accent/20 transition hover:bg-orange-500">
                      Launch provider profile
                    </Link>
                  </>
                ) : (
                  <>
                    <h2 className="mt-2 text-lg font-semibold">Provider mode active</h2>
                    <p className="mt-2 text-sm text-brand/60">You can edit your listing details from the dashboard and accept bookings instantly.</p>
                    <Link to="/dashboard" className="mt-4 inline-flex rounded-2xl bg-accent px-5 py-3 text-sm font-bold text-white shadow-lg shadow-accent/20 transition hover:bg-orange-500">
                      Open dashboard
                    </Link>
                  </>
                )}
              </Panel>
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
        </div>
      </div>
      {/* Sidebar switches from an offcanvas sheet to a persistent column at
          the same 768px breakpoint useIsMobile uses (md:), so BottomNav must
          hide there too — otherwise both navs render at once on desktop,
          with BottomNav floating uncentered over the sidebar's content area. */}
      <div className="md:hidden">
        <BottomNav />
      </div>
    </SidebarProvider>
  );
}

// Split out so useSidebar() can close the mobile off-canvas drawer after a
// section selection — SidebarMenuButton has no such behavior built in, and
// ProfilePage itself renders the SidebarProvider that owns this context, so
// it can't call the hook directly (the provider doesn't exist yet during
// ProfilePage's own render).
function ProfileSidebarNav({
  section, setSection, sections, onSignOut,
}: {
  section: Section;
  setSection: (s: Section) => void;
  sections: { id: Section; label: string; icon: typeof User }[];
  onSignOut: () => void;
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  const selectSection = (s: Section) => {
    setSection(s);
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar>
      <SidebarContent>
        <div className="px-4 pt-5 pb-3 flex items-center gap-2.5">
          <div className="size-9 rounded-xl bg-accent grid place-items-center text-white shadow-lg shadow-accent/20">
            <User className="size-4" />
          </div>
          <div>
            <Eyebrow>Fixrly</Eyebrow>
            <div className="text-sm font-black tracking-tight">Account</div>
          </div>
        </div>
        <SidebarGroup>
          <SidebarGroupLabel>Settings</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {sections.map((s) => {
                const Icon = s.icon;
                return (
                  <SidebarMenuItem key={s.id}>
                    <SidebarMenuButton isActive={section === s.id} onClick={() => selectSection(s.id)}>
                      <Icon className="size-4" />
                      <span>{s.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link to="/"><Home className="size-4" /><span>Back to app</span></Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onSignOut}>
              <LogOut className="size-4" /><span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
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
