import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useSession, useRoles } from "@/lib/session";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BottomNav } from "@/components/BottomNav";
import { AvatarUpload } from "@/components/AvatarUpload";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { LogOut, User, Briefcase, Shield, Home, Palette, Sun, Moon, Laptop } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, SidebarFooter,
} from "@/components/ui/sidebar";
import { Panel, Eyebrow, FormField, PrimaryButton, PageSpinner } from "@/components/ui-kit";
import { useTheme, type Theme } from "@/lib/theme";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "My profile — Nearby" }, { name: "robots", content: "noindex" }] }),
  component: ProfilePage,
});

type Section = "profile" | "provider" | "theme" | "admin";

// This page's account sidebar renders as a plain surface instead of the app's
// dark navy sidebar panel — scoped to <body> (not just this tree) because the
// Sidebar's mobile drawer is a Radix portal appended outside this component.
function useNeutralSidebarSurface() {
  useEffect(() => {
    const body = document.body;
    const overrides: [string, string][] = [
      ["--sidebar", "var(--surface)"],
      ["--sidebar-foreground", "var(--foreground)"],
      ["--sidebar-primary", "var(--accent)"],
      ["--sidebar-primary-foreground", "var(--accent-foreground)"],
      ["--sidebar-accent", "var(--muted)"],
      ["--sidebar-accent-foreground", "var(--foreground)"],
      ["--sidebar-border", "var(--border)"],
      ["--sidebar-ring", "var(--accent)"],
    ];
    overrides.forEach(([k, v]) => body.style.setProperty(k, v));
    return () => overrides.forEach(([k]) => body.style.removeProperty(k));
  }, []);
}

function ProfilePage() {
  const { user, loading: sessionLoading } = useSession();
  const { data: roles = [] } = useRoles(user);
  const isAdmin = roles.includes("admin");
  const isProvider = roles.includes("provider");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [section, setSection] = useState<Section>("profile");
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

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  if (sessionLoading || !user) {
    return <PageSpinner />;
  }

  const sections = [
    { id: "profile" as const, label: "Profile", icon: User },
    { id: "provider" as const, label: "Provider", icon: Briefcase },
    { id: "theme" as const, label: "Theme", icon: Palette },
    ...(isAdmin ? [{ id: "admin" as const, label: "Admin", icon: Shield }] : []),
  ];

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-canvas">
        <Sidebar>
          <SidebarContent>
            <div className="px-4 pt-5 pb-3 flex items-center gap-2.5">
              <div className="size-9 rounded-xl bg-accent grid place-items-center text-white shadow-lg shadow-accent/20">
                <User className="size-4" />
              </div>
              <div>
                <Eyebrow>Nearby</Eyebrow>
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
                        <SidebarMenuButton isActive={section === s.id} onClick={() => setSection(s.id)}>
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
                <SidebarMenuButton onClick={signOut}>
                  <LogOut className="size-4" /><span>Sign out</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-16 flex items-center gap-3 border-b border-soft bg-surface/90 backdrop-blur sticky top-0 z-20 px-4">
            <SidebarTrigger />
            <div className="flex-1 min-w-0">
              <Eyebrow>Account</Eyebrow>
              <h1 className="text-base font-black tracking-tight truncate">{sections.find((s) => s.id === section)?.label}</h1>
            </div>
          </header>

          <main className="flex-1 px-4 py-6 pb-28 max-w-3xl w-full mx-auto">
            {section === "profile" && (
              <Panel>
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                  <AvatarUpload
                    userId={user!.id}
                    avatarUrl={profile?.avatar_url ?? null}
                    label={(user?.email?.[0] ?? "?").toUpperCase()}
                  />
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold">Welcome back</h2>
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
      <BottomNav />
    </SidebarProvider>
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
      <p className="mt-2 text-sm text-brand/60">Choose how Nearby looks on this device. Applies everywhere, instantly.</p>

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
