import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { signOut } from "firebase/auth";
import { firebaseAuth } from "@/integrations/firebase/client";
import { supabase } from "@/integrations/supabase/client";
import { useSession, useRoles, useMyBusiness } from "@/lib/session";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BottomNav } from "@/components/BottomNav";
import { AppTopBar } from "@/components/AppTopBar";
import { AvatarUpload } from "@/components/AvatarUpload";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  LogOut,
  User,
  Briefcase,
  Shield,
  ShieldCheck,
  FileText,
  Palette,
  Sun,
  Moon,
  Laptop,
  Bell,
  BellOff,
  ChevronRight,
  ArrowRight,
  BadgeCheck,
  Mail,
  Phone,
  Camera,
  CalendarCheck,
  CheckCircle2,
  Heart,
  CalendarDays,
  Gauge,
  Wallet,
  Store,
  Eye,
  CircleHelp,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { PageSpinner } from "@/components/ui-kit";
import { useTheme, type Theme } from "@/lib/theme";
import { getPushSubscriptionState, isPushSupported, subscribeToPush, unsubscribeFromPush } from "@/lib/push";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "My profile — Fixrly" }, { name: "robots", content: "noindex" }] }),
  component: ProfilePage,
});

type Section = "profile" | "notifications" | "theme" | "admin";

// Shared card chrome, matching the home and provider pages.
const card = "rounded-2xl border border-soft bg-surface shadow-[0_8px_30px_rgba(15,23,42,0.06)]";
const SUPPORT_EMAIL = "support@fixrly.app";

function ProfilePage() {
  const { user, loading: sessionLoading } = useSession();
  const { data: roles = [] } = useRoles(user);
  const { data: business } = useMyBusiness(user, roles);
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

  // Headline numbers for the stats row — all head-only count queries.
  const { data: stats } = useQuery({
    queryKey: ["profile-stats", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [all, completed, following] = await Promise.all([
        supabase.from("bookings").select("id", { count: "exact", head: true }).eq("customer_id", user!.id),
        supabase.from("bookings").select("id", { count: "exact", head: true }).eq("customer_id", user!.id).eq("status", "completed"),
        supabase.from("provider_follows" as any).select("id", { count: "exact", head: true }).eq("follower_id", user!.id),
      ]);
      return { bookings: all.count ?? 0, completed: completed.count ?? 0, following: following.count ?? 0 };
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

  const displayName = profile?.full_name || user.email?.split("@")[0] || "Your profile";
  const roleLabel = isAdmin ? "Admin" : isProvider ? "Provider" : "Customer";
  const memberSince = profile?.created_at ? new Date(profile.created_at).getFullYear() : null;
  const checklist = [
    { icon: Mail, label: "Email address", done: !!user.email },
    { icon: User, label: "Full name", done: !!profile?.full_name },
    { icon: Phone, label: "Phone number", done: !!profile?.phone },
    { icon: Camera, label: "Profile photo", done: !!profile?.avatar_url },
  ];
  const completeCount = checklist.filter((c) => c.done).length;
  const tabs: { id: Section; label: string }[] = [
    { id: "profile", label: "Personal info" },
    { id: "notifications", label: "Notifications" },
    { id: "theme", label: "Appearance" },
    ...(isAdmin ? [{ id: "admin" as const, label: "Admin" }] : []),
  ];

  return (
    <div className="min-h-screen bg-canvas pb-32 text-brand lg:pb-12">
      <AppTopBar />

      <div className="mx-auto max-w-3xl px-4 pt-4 lg:max-w-[1240px] lg:px-6 lg:pt-6">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6">
          <main className="space-y-4">
            {/* ---------- Identity ---------- */}
            <section className="relative overflow-hidden rounded-2xl bg-[#0b1730] text-white shadow-[0_18px_40px_rgba(11,23,48,0.25)]">
              <div className="pointer-events-none absolute -right-16 -top-20 size-72 rounded-full bg-accent/20 blur-2xl" />
              <div className="pointer-events-none absolute -bottom-24 right-40 size-56 rounded-full bg-blue-500/15 blur-2xl" />
              <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-7">
                <div className="flex min-w-0 flex-1 items-center gap-4 sm:gap-6">
                  <AvatarUpload
                    userId={user.id}
                    avatarUrl={profile?.avatar_url ?? null}
                    label={displayName[0]?.toUpperCase() ?? "?"}
                    innerClassName="size-20 rounded-full border-4 border-white bg-white/10 text-white sm:size-28 sm:text-3xl"
                  />
                  <div className="min-w-0">
                    <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
                      <span className="truncate">{displayName}</span>
                      {isProvider && <BadgeCheck className="size-6 shrink-0 fill-blue-500 text-white sm:size-7" aria-label="Provider" />}
                    </h1>
                    <div className="mt-1.5 flex items-center gap-1.5 text-sm text-white/85">
                      <Mail className="size-4 shrink-0" />
                      <span className="truncate">{user.email}</span>
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium ring-1 ring-white/15">
                        <ShieldCheck className="size-3.5" /> {roleLabel}
                      </span>
                      {memberSince && (
                        <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium ring-1 ring-white/15">Member since {memberSince}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2.5 sm:self-end">
                  {isProvider && (
                    <Link
                      to="/provider/$id"
                      params={{ id: user.id }}
                      className="flex flex-1 items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-blue-600 shadow-lg transition hover:bg-blue-50 sm:flex-none"
                    >
                      <Eye className="size-4" /> View public profile
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={handleSignOut}
                    aria-label="Sign out"
                    className="grid size-11 shrink-0 place-items-center rounded-full border border-white/25 bg-black/25 backdrop-blur-md transition hover:bg-red-500/80"
                  >
                    <LogOut className="size-5" />
                  </button>
                </div>
              </div>
            </section>

            {/* ---------- Stats ---------- */}
            <section className={cn(card, "grid grid-cols-4 divide-x divide-[var(--soft-border)] py-4 lg:py-5")} aria-label="Your activity">
              <AccountStat icon={CalendarCheck} tone="bg-orange-100 text-accent dark:bg-orange-500/15" value={stats?.bookings ?? "–"} label="Bookings" />
              <AccountStat icon={CheckCircle2} tone="bg-green-100 text-green-600 dark:bg-green-500/15" value={stats?.completed ?? "–"} label="Completed" />
              <AccountStat icon={Heart} tone="bg-pink-100 text-pink-500 dark:bg-pink-500/15" value={stats?.following ?? "–"} label="Following" />
              <AccountStat icon={CalendarDays} tone="bg-violet-100 text-violet-600 dark:bg-violet-500/15" value={memberSince ?? "–"} label="Joined" />
            </section>

            {/* ---------- Settings tabs ---------- */}
            <section className={cn(card, "p-5")}>
              <nav className="-mx-5 -mt-1 mb-5 flex gap-6 overflow-x-auto border-b border-soft px-5 no-scrollbar sm:gap-8" aria-label="Account sections">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSection(t.id)}
                    aria-current={section === t.id ? "true" : undefined}
                    className={cn(
                      "-mb-px shrink-0 border-b-2 pb-3 text-[15px] font-medium transition",
                      section === t.id ? "border-accent font-semibold text-accent" : "border-transparent text-brand/65 hover:text-brand",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </nav>

              {section === "profile" && (
                <form onSubmit={save} className="space-y-5">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field icon={User} label="Full name" required value={fullName} onChange={setFullName} placeholder="Your name" />
                    <Field icon={Phone} label="Phone" type="tel" value={phone} onChange={setPhone} placeholder="e.g. 0803 000 0000" />
                  </div>
                  <Field icon={Mail} label="Email" value={user.email ?? ""} disabled hint="Your sign-in email can't be changed here." />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent to-orange-500 px-6 text-sm font-semibold text-white shadow-lg shadow-accent/25 transition hover:brightness-105 disabled:opacity-60 max-sm:w-full"
                    >
                      {saving && <Loader2 className="size-4 animate-spin" />} Save changes
                    </button>
                  </div>
                </form>
              )}

              {section === "notifications" && <NotificationsSection userId={user.id} />}

              {section === "theme" && <ThemeSection />}

              {section === "admin" && isAdmin && (
                <div>
                  <h2 className="text-lg font-bold">Admin console</h2>
                  <p className="mt-1.5 text-sm text-brand/60">Requests, users, payments, and platform settings.</p>
                  <Link
                    to="/admin"
                    className="mt-4 inline-flex items-center gap-2.5 rounded-xl bg-[#0b1730] px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 dark:bg-white dark:text-black"
                  >
                    <Shield className="size-4" /> Open admin console
                  </Link>
                </div>
              )}
            </section>
          </main>

          {/* ---------- Side column (stacks below on mobile) ---------- */}
          <aside className="mt-4 space-y-4 lg:sticky lg:top-24 lg:mt-0">
            <section className={cn(card, "p-5")} aria-labelledby="completeness">
              <div className="flex items-start gap-3.5">
                <span
                  className={cn(
                    "grid size-12 shrink-0 place-items-center rounded-full text-white shadow-md",
                    completeCount === checklist.length ? "bg-green-600 shadow-green-600/25" : "bg-accent shadow-accent/25",
                  )}
                >
                  <ShieldCheck className="size-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 id="completeness" className="text-base font-bold">
                    {completeCount === checklist.length ? "Profile complete" : "Complete your profile"}
                  </h2>
                  <p className="mt-0.5 text-xs leading-relaxed text-brand/55">A complete profile helps providers recognise and reach you.</p>
                  <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-canvas">
                    <div className="h-full rounded-full bg-gradient-to-r from-accent to-orange-400 transition-all" style={{ width: `${(completeCount / checklist.length) * 100}%` }} />
                  </div>
                </div>
              </div>
              <ul className="mt-4 divide-y divide-[var(--soft-border)] border-t border-soft">
                {checklist.map(({ icon: Icon, label, done }) => (
                  <li key={label} className="flex items-center gap-3 py-3 text-sm">
                    <Icon className="size-4 shrink-0 text-brand/70" />
                    <span className="flex-1">{label}</span>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                        done ? "bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-400" : "bg-orange-50 text-accent dark:bg-orange-500/15",
                      )}
                    >
                      {done ? "Added" : "Missing"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            {isProvider ? (
              <section className={cn(card, "p-5")} aria-labelledby="provider-tools">
                <h2 id="provider-tools" className="text-lg font-bold">Provider tools</h2>
                <div className="mt-3 space-y-1">
                  <MenuRow to="/dashboard" icon={Gauge} tone="bg-orange-50 text-accent dark:bg-orange-500/10" label="Provider dashboard" />
                  <MenuRow to="/payouts" icon={Wallet} tone="bg-green-50 text-green-600 dark:bg-green-500/10" label="Earnings & payouts" />
                  {business && <MenuRow to="/business" icon={Store} tone="bg-blue-50 text-blue-600 dark:bg-blue-500/10" label="Business & team" />}
                </div>
              </section>
            ) : (
              <Link
                to="/become-provider"
                className="relative flex items-center gap-4 overflow-hidden rounded-2xl bg-gradient-to-br from-[#ff5a1f] to-[#ff8a3d] p-5 text-white shadow-[0_18px_40px_rgba(255,90,31,0.25)] transition hover:brightness-105"
              >
                <div className="pointer-events-none absolute -right-8 -top-10 size-32 rounded-full bg-white/15" />
                <span className="relative grid size-12 shrink-0 place-items-center rounded-xl bg-white/20">
                  <Briefcase className="size-5" />
                </span>
                <span className="relative min-w-0 flex-1">
                  <span className="block text-base font-bold">Become a Provider</span>
                  <span className="block text-xs text-white/85">List your services and start earning</span>
                </span>
                <ArrowRight className="relative size-5 shrink-0" />
              </Link>
            )}

            <section className={cn(card, "p-2")} aria-label="More">
              <MenuRow onClick={() => setSection("theme")} icon={Palette} tone="bg-purple-50 text-purple-600 dark:bg-purple-500/10" label="Appearance" detail={theme} />
              <MenuRow href={`mailto:${SUPPORT_EMAIL}`} icon={CircleHelp} tone="bg-blue-50 text-blue-600 dark:bg-blue-500/10" label="Help & support" />
              <MenuRow to="/privacy" icon={ShieldCheck} tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10" label="Privacy Policy" />
              <MenuRow to="/terms" icon={FileText} tone="bg-amber-50 text-amber-600 dark:bg-amber-500/10" label="Terms and Conditions" />
              <MenuRow onClick={handleSignOut} icon={LogOut} tone="bg-red-50 text-red-600 dark:bg-red-500/10" label="Sign out" danger />
            </section>
          </aside>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}

function AccountStat({ icon: Icon, tone, value, label }: { icon: LucideIcon; tone: string; value: number | string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-1 text-center lg:flex-row lg:justify-center lg:gap-3.5 lg:px-4 lg:text-left">
      <span className={cn("grid size-11 shrink-0 place-items-center rounded-full lg:size-12", tone)}>
        <Icon className="size-5" strokeWidth={1.9} />
      </span>
      <span className="flex flex-col items-center gap-1.5 lg:items-start lg:gap-1">
        <span className="mt-1 text-lg font-bold leading-none lg:mt-0 lg:text-xl">{value}</span>
        <span className="text-[11px] leading-tight text-brand/55 sm:text-xs lg:text-[13px]">{label}</span>
      </span>
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  value,
  onChange,
  type = "text",
  required,
  disabled,
  placeholder,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  onChange?: (v: string) => void;
  type?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">
        {label}
        {required && <span className="text-accent"> *</span>}
      </span>
      <span
        className={cn(
          "flex items-center gap-3 rounded-xl border border-soft bg-canvas px-3.5 py-3 transition focus-within:border-accent/50 focus-within:ring-4 focus-within:ring-accent/10",
          disabled && "opacity-70",
        )}
      >
        <Icon className="size-4 shrink-0 text-brand/45" />
        <input
          type={type}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          className="w-full min-w-0 bg-transparent text-sm outline-none disabled:cursor-not-allowed"
        />
      </span>
      {hint && <span className="mt-1.5 block text-xs text-brand/50">{hint}</span>}
    </label>
  );
}

function MenuRow({
  to,
  href,
  onClick,
  icon: Icon,
  tone,
  label,
  detail,
  danger,
}: {
  to?: string;
  href?: string;
  onClick?: () => void;
  icon: LucideIcon;
  tone: string;
  label: string;
  detail?: string;
  danger?: boolean;
}) {
  const className = "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-canvas";
  const content = (
    <>
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", tone)}>
        <Icon className="size-4" />
      </span>
      <span className={cn("flex-1 text-sm font-semibold", danger && "text-red-600")}>{label}</span>
      {detail && <span className="text-xs font-medium capitalize text-brand/45">{detail}</span>}
      {!danger && <ChevronRight className="size-4 text-brand/30" />}
    </>
  );
  if (to) {
    return (
      <Link to={to} className={className}>
        {content}
      </Link>
    );
  }
  if (href) {
    return (
      <a href={href} className={className}>
        {content}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
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
    <div>
      <h2 className="text-lg font-bold">Push notifications</h2>
      <p className="mt-1.5 text-sm text-brand/60">
        Get notified the moment a booking is accepted, your provider is on the way, or a customer books you — even
        when Fixrly isn't open.
      </p>

      <div className="mt-5">
        {state === "loading" && <p className="text-sm text-brand/50">Checking status…</p>}

        {state === "unsupported" && <p className="text-sm text-brand/50">Push notifications aren't supported in this browser.</p>}

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
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-accent to-orange-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-accent/25 transition hover:brightness-105 disabled:opacity-60"
          >
            <Bell className="size-4" />
            {working ? "Enabling…" : "Enable push notifications"}
          </button>
        )}

        {state === "subscribed" && (
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 dark:bg-green-500/15 dark:text-green-400">
              <Bell className="size-3.5" /> Enabled on this device
            </span>
            <button
              type="button"
              onClick={disable}
              disabled={working}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand/50 hover:text-red-600 disabled:opacity-60"
            >
              <BellOff className="size-3.5" />
              {working ? "Turning off…" : "Turn off"}
            </button>
          </div>
        )}
      </div>
    </div>
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
    <div>
      <h2 className="text-lg font-bold">Theme</h2>
      <p className="mt-1.5 text-sm text-brand/60">Choose how Fixrly looks on this device. Applies everywhere, instantly.</p>

      <div className="mt-5 grid grid-cols-3 gap-3">
        {THEME_OPTIONS.map(({ id, label, icon: Icon }) => {
          const active = theme === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTheme(id)}
              aria-pressed={active}
              className={cn(
                "flex flex-col items-center gap-2 rounded-xl border p-4 text-sm font-semibold transition",
                active ? "border-accent bg-orange-50/60 text-accent ring-2 ring-accent/15 dark:bg-orange-500/10" : "border-soft text-brand/60 hover:border-accent/30",
              )}
            >
              <Icon className="size-5" />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
