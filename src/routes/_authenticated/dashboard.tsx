import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession, useRoles, useMyBusiness } from "@/lib/session";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BottomNav } from "@/components/BottomNav";
import { AppTopBar } from "@/components/AppTopBar";
import { CategoryIcon } from "@/components/CategoryVisual";
import { NotificationsBell } from "@/components/NotificationsBell";
import { LogoMark } from "@/components/Logo";
import {
  AvailabilityView,
  EarningsView,
  JobsView,
  PortfolioView,
  ScheduleView,
  ServiceAreaView,
  type DashboardView,
} from "@/components/provider/ProviderViews";
import { geocodeLocation } from "@/lib/geocode.functions";
import { toast } from "sonner";
import {
  Loader2,
  MapPin,
  CalendarDays,
  CalendarCheck,
  Wallet,
  Star,
  Briefcase,
  BarChart3,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  ChevronRight,
  CheckCircle2,
  Circle,
  Clock,
  Wrench,
  ShieldCheck,
  Crown,
  Store,
  Eye,
  Rocket,
  Phone,
  Power,
  Images,
  BadgeCheck,
  type LucideIcon,
} from "lucide-react";
import { getPaymentStatusBadge, getPaymentStatusLabel } from "@/lib/booking-payment";
import { currencySymbol, formatMoney, useCurrency } from "@/lib/currency";
import { formatRelativeTime } from "@/lib/time";
import { StatusBadge } from "@/components/ui-kit";
import { cn, shortDisplayName } from "@/lib/utils";

const DashboardCharts = lazy(() => import("@/components/DashboardCharts"));

const VIEWS: DashboardView[] = ["jobs", "schedule", "earnings", "availability", "service-area", "portfolio"];

export const Route = createFileRoute("/_authenticated/dashboard")({
  // `view` opens one of the focused provider screens (My Jobs, Earnings…)
  // instead of the dashboard overview.
  validateSearch: (search: Record<string, unknown>): { view?: DashboardView } => ({
    view: VIEWS.includes(search.view as DashboardView) ? (search.view as DashboardView) : undefined,
  }),
  head: () => ({ meta: [{ title: "Provider dashboard — Fixrly" }, { name: "robots", content: "noindex" }] }),
  component: DashboardPage,
});

// Shared card chrome, matching the rest of the redesigned app.
const card = "rounded-2xl border border-soft bg-surface shadow-[0_8px_30px_rgba(15,23,42,0.06)]";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good Morning" : h < 17 ? "Good Afternoon" : "Good Evening";
}

const isSameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

function DashboardPage() {
  const { view } = Route.useSearch();
  const { user } = useSession();
  const navigate = useNavigate();
  const { data: roles = [] } = useRoles(user);
  const isProvider = roles.includes("provider");
  const { data: business, isLoading: businessLoading } = useMyBusiness(user, roles);
  const isStaffOnly = !isProvider && business?.role !== "owner" && !!business;
  const qc = useQueryClient();
  const geocode = useServerFn(geocodeLocation);
  const currency = useCurrency();
  const [chartMetric, setChartMetric] = useState<"earnings" | "bookings">("earnings");

  const { data: profile } = useQuery({
    queryKey: ["provider-profile", user?.id],
    enabled: !!user && isProvider,
    queryFn: async () => {
      const { data, error } = await supabase.from("provider_profiles").select("*").eq("id", user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: account } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data } = await supabase.from("service_categories").select("id,slug,name,icon").order("sort_order");
      return data ?? [];
    },
  });

  const { data: myCategories = [] } = useQuery({
    queryKey: ["my-categories", user?.id],
    enabled: !!user && isProvider,
    queryFn: async () => {
      const { data } = await supabase.from("provider_categories").select("category_id").eq("provider_id", user!.id);
      return (data ?? []).map((r) => r.category_id);
    },
  });

  const { data: bookings = [] } = useQuery({
    queryKey: ["provider-bookings", user?.id],
    enabled: !!user && isProvider,
    queryFn: async () => {
      const { data } = await supabase
        .from("bookings")
        .select("*, customer:profiles!bookings_customer_id_profiles_fkey(full_name,phone,avatar_url), category:service_categories(name,icon,slug)")
        .eq("provider_id", user!.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: ratings = [] } = useQuery({
    queryKey: ["provider-ratings", user?.id],
    enabled: !!user && isProvider,
    queryFn: async () => {
      const { data, error } = await supabase.from("reviews").select("rating").eq("provider_id", user!.id);
      if (error) throw error;
      return (data ?? []).map((r) => r.rating as number);
    },
  });

  const updateStatus = async (id: string, status: "accepted" | "rejected" | "completed") => {
    const { error } = await supabase.from("bookings").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Booking ${status}`);
    qc.invalidateQueries({ queryKey: ["provider-bookings", user!.id] });
  };

  const stats = useMemo(() => {
    // Real net payout (booking total minus platform fee), not raw
    // total_price, and only for bookings actually paid — a completed but
    // unpaid booking isn't earned yet. This is the same figure
    // provider_available_balance() draws down from once a withdrawal is
    // requested, so it can diverge from "available to withdraw" on /payouts
    // the moment any withdrawal is pending — hence "Total earned" below
    // rather than "Earnings", to avoid the two being read as the same number.
    const earned = bookings
      .filter((b: any) => b.status === "completed" && b.payment_status === "paid")
      .reduce((s: number, b: any) => s + (Number(b.provider_payout_amount) || 0), 0);
    const now = new Date();
    const decided = bookings.filter((b: any) => b.status !== "pending" && b.status !== "cancelled");
    const declined = decided.filter((b: any) => b.status === "rejected").length;
    return {
      pending: bookings.filter((b: any) => b.status === "pending").length,
      accepted: bookings.filter((b: any) => b.status === "accepted").length,
      completed: bookings.filter((b: any) => b.status === "completed").length,
      today: bookings.filter((b: any) => isSameDay(new Date(b.scheduled_at), now) && b.status !== "rejected" && b.status !== "cancelled").length,
      // Share of requests the provider said yes to, once they'd decided.
      acceptanceRate: decided.length ? Math.round(((decided.length - declined) / decided.length) * 100) : null,
      earned,
    };
  }, [bookings]);

  const ratingStats = useMemo(() => {
    const count = ratings.length;
    const avg = count ? ratings.reduce((a, b) => a + b, 0) / count : null;
    const dist = [5, 4, 3, 2, 1].map((star) => {
      const n = ratings.filter((r) => Math.round(r) === star).length;
      return { star, pct: count ? Math.round((n / count) * 100) : 0 };
    });
    return { count, avg, dist };
  }, [ratings]);

  // Last 8 Monday-starting weeks. Volume buckets by created_at (when the
  // request came in); earnings buckets by paid_at (when it was actually
  // earned) — the same paid+completed filter stats.earned above uses, just
  // spread across weeks instead of summed into one number.
  const weeklyData = useMemo(() => {
    const startOfWeek = (d: Date) => {
      const date = new Date(d);
      const day = date.getDay();
      date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
      date.setHours(0, 0, 0, 0);
      return date;
    };
    const weeks: { key: string; label: string }[] = [];
    const thisWeekStart = startOfWeek(new Date());
    for (let i = 7; i >= 0; i--) {
      const start = new Date(thisWeekStart);
      start.setDate(start.getDate() - i * 7);
      weeks.push({
        key: start.toISOString().slice(0, 10),
        label: start.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      });
    }
    const volume = new Map(weeks.map((w) => [w.key, 0]));
    const earnings = new Map(weeks.map((w) => [w.key, 0]));
    const weekKeyFor = (dateStr: string) => startOfWeek(new Date(dateStr)).toISOString().slice(0, 10);

    for (const b of bookings as any[]) {
      const createdKey = weekKeyFor(b.created_at);
      if (volume.has(createdKey)) volume.set(createdKey, (volume.get(createdKey) ?? 0) + 1);
      if (b.status === "completed" && b.payment_status === "paid" && b.paid_at) {
        const paidKey = weekKeyFor(b.paid_at);
        if (earnings.has(paidKey)) earnings.set(paidKey, (earnings.get(paidKey) ?? 0) + (Number(b.provider_payout_amount) || 0));
      }
    }
    return weeks.map((w) => ({ week: w.label, bookings: volume.get(w.key) ?? 0, earnings: earnings.get(w.key) ?? 0 }));
  }, [bookings]);

  // Upcoming work: requests still awaiting a decision plus accepted /
  // en-route jobs, soonest first — this is where the accept/decline/
  // complete actions live.
  const upcoming = useMemo(
    () =>
      (bookings as any[])
        .filter((b) => b.status === "pending" || b.status === "accepted" || b.status === "on_the_way")
        .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
        .slice(0, 5),
    [bookings],
  );

  const [form, setForm] = useState({
    business_name: "",
    bio: "",
    hourly_rate: "",
    service_radius_km: 25,
    address: "",
    city: "",
    zip: "",
    phone: "",
    availability_note: "",
    is_active: true,
    latitude: null as number | null,
    longitude: null as number | null,
  });
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [geocoding, setGeocoding] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({
        business_name: profile.business_name ?? "",
        bio: profile.bio ?? "",
        hourly_rate: profile.hourly_rate?.toString() ?? "",
        service_radius_km: profile.service_radius_km ?? 25,
        address: profile.address ?? "",
        city: profile.city ?? "",
        zip: profile.zip ?? "",
        phone: profile.phone ?? "",
        availability_note: profile.availability_note ?? "",
        is_active: profile.is_active ?? true,
        latitude: profile.latitude,
        longitude: profile.longitude,
      });
    }
  }, [profile]);
  useEffect(() => setSelectedCats(myCategories), [myCategories]);

  useEffect(() => {
    if (isStaffOnly) navigate({ to: "/business", replace: true });
  }, [isStaffOnly, navigate]);

  if (!isProvider) {
    if (businessLoading || isStaffOnly) {
      return <div className="min-h-screen bg-canvas" />;
    }
    return (
      <div className="min-h-screen bg-canvas grid place-items-center px-6 pb-24">
        <div className={cn(card, "max-w-sm p-8 text-center")}>
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-orange-50 text-accent dark:bg-orange-500/10">
            <Briefcase className="size-6" />
          </span>
          <h1 className="mt-4 text-xl font-bold tracking-tight">You're not a provider yet</h1>
          <p className="text-sm text-brand/60 mt-2">List your services on Fixrly to start getting booked.</p>
          <Link
            to="/become-provider"
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent to-orange-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-accent/25 transition hover:brightness-105"
          >
            Become a Provider <ArrowRight className="size-4" />
          </Link>
        </div>
        <BottomNav />
      </div>
    );
  }

  const geocodeAddress = async () => {
    const q = [form.address, form.city, form.zip].filter(Boolean).join(", ");
    if (!q) return toast.error("Enter address, city, or ZIP first");
    setGeocoding(true);
    try {
      const res = await geocode({ data: { query: q } });
      if (!res.found) toast.error("Location not found");
      else {
        setForm((f) => ({ ...f, latitude: res.lat, longitude: res.lng }));
        toast.success(`Located: ${res.formatted}`);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setGeocoding(false);
    }
  };

  const saveListing = async () => {
    setSaving(true);
    try {
      // "Pin on map" is easy to skip — if an address was typed but never
      // pinned, geocode it now so distance-to-customer and map markers
      // work instead of silently saving with no coordinates.
      let { latitude, longitude } = form;
      if (latitude == null) {
        const q = [form.address, form.city, form.zip].filter(Boolean).join(", ");
        if (q) {
          try {
            const res = await geocode({ data: { query: q } });
            if (res.found) {
              latitude = res.lat;
              longitude = res.lng;
            }
          } catch {
            /* best-effort — save without coordinates rather than block */
          }
        }
      }

      const payload = {
        id: user!.id,
        business_name: form.business_name,
        bio: form.bio || null,
        hourly_rate: form.hourly_rate ? Number(form.hourly_rate) : null,
        service_radius_km: form.service_radius_km,
        address: form.address || null,
        city: form.city || null,
        zip: form.zip || null,
        phone: form.phone || null,
        availability_note: form.availability_note || null,
        is_active: form.is_active,
        latitude,
        longitude,
      };
      const { error } = await supabase.from("provider_profiles").upsert(payload);
      if (error) throw error;

      // sync categories
      await supabase.from("provider_categories").delete().eq("provider_id", user!.id);
      if (selectedCats.length > 0) {
        await supabase.from("provider_categories").insert(selectedCats.map((cid) => ({ provider_id: user!.id, category_id: cid })));
      }
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["provider-profile", user!.id] });
      qc.invalidateQueries({ queryKey: ["my-categories", user!.id] });
      qc.invalidateQueries({ queryKey: ["providers"] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    saveListing();
  };

  if (view === "jobs") return <JobsView bookings={bookings as any[]} providerId={user!.id} currency={currency} updateStatus={updateStatus} />;
  if (view === "schedule") return <ScheduleView bookings={bookings as any[]} />;
  if (view === "earnings") return <EarningsView bookings={bookings as any[]} providerId={user!.id} currency={currency} />;
  if (view === "availability") return <AvailabilityView form={form} setForm={setForm} saving={saving} onSave={saveListing} />;
  if (view === "service-area")
    return <ServiceAreaView form={form} setForm={setForm} saving={saving} onSave={saveListing} geocoding={geocoding} onPin={geocodeAddress} />;
  if (view === "portfolio") return <PortfolioView providerId={user!.id} photos={profile?.photo_urls ?? []} />;

  // Jump to a part of the listing form below (and focus a field in it).
  const goToListing = (anchor: string, focusId?: string) => {
    document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (focusId) setTimeout(() => document.getElementById(focusId)?.focus({ preventScroll: true }), 450);
  };

  const firstName = shortDisplayName(account?.full_name, user?.email);
  const thisWeek = weeklyData[weeklyData.length - 1];
  const lastWeek = weeklyData[weeklyData.length - 2];
  const headline = chartMetric === "earnings" ? thisWeek?.earnings ?? 0 : thisWeek?.bookings ?? 0;
  const previous = chartMetric === "earnings" ? lastWeek?.earnings ?? 0 : lastWeek?.bookings ?? 0;
  const change = previous > 0 ? Math.round(((headline - previous) / previous) * 100) : null;
  const pinned = form.latitude != null;
  const accountItems = [
    { label: "Approved provider", ok: true },
    { label: "Listing visible to customers", ok: form.is_active },
    { label: "Phone number on file", ok: !!form.phone },
    { label: "Location pinned on map", ok: pinned },
    { label: "At least one service", ok: selectedCats.length > 0 },
  ];
  const topRated = ratingStats.avg != null && ratingStats.avg >= 4.5 && ratingStats.count >= 3;

  return (
    <div className="min-h-screen bg-canvas pb-32 text-brand lg:pb-12">
      <AppTopBar />

      {/* ---------- Mobile home ---------- */}
      <div className="lg:hidden">
        <header className="relative overflow-hidden bg-[#0b1730] px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-24 text-white">
          <div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-accent/25 blur-3xl" />
          <div className="relative flex items-center justify-between">
            <Link to="/" className="flex items-center gap-1" aria-label="Fixrly home">
              <LogoMark className="size-9 text-accent" />
              <span className="text-2xl font-extrabold tracking-tight">fixrly</span>
            </Link>
            <span className="light-surface rounded-full bg-white">
              <NotificationsBell />
            </span>
          </div>
          <p className="relative mt-5 text-sm text-white/75">{greeting()},</p>
          <h1 className="relative text-[1.75rem] font-extrabold leading-tight tracking-tight">
            {firstName} <span aria-hidden="true">👋</span>
          </h1>
          <p className="relative text-sm text-white/70">Here's your performance overview.</p>
          <div className="relative mt-4 flex items-center gap-3.5">
            <span className="relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-full border-[3px] border-white bg-white/10 text-xl font-bold">
              {firstName[0]?.toUpperCase()}
              {account?.avatar_url && <img src={account.avatar_url} alt="" className="absolute inset-0 h-full w-full bg-white object-cover" />}
            </span>
            <div className="min-w-0">
              <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", form.is_active ? "bg-green-500" : "bg-white/20")}>
                {form.is_active ? <BadgeCheck className="size-3.5" /> : <Power className="size-3.5" />}
                {form.is_active ? "Active" : "Paused"}
              </span>
              <div className="mt-1 truncate text-sm font-semibold">{profile?.business_name || "Service Provider"}</div>
              <div className="flex items-center gap-1 text-xs text-white/75">
                <Star className="size-3.5 fill-yellow-400 text-yellow-400" />
                {ratingStats.avg != null ? ratingStats.avg.toFixed(1) : "New"} ({ratingStats.count} {ratingStats.count === 1 ? "review" : "reviews"})
              </div>
            </div>
          </div>
        </header>

        <div className="relative -mt-16 space-y-4 px-4">
          <section className={cn(card, "p-4")} aria-label="Today at a glance">
            <div className="grid grid-cols-2 divide-x divide-[var(--soft-border)]">
              <div className="flex items-start gap-2.5 pr-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-orange-50 text-accent dark:bg-orange-500/10">
                  <CalendarDays className="size-4" />
                </span>
                <div>
                  <div className="text-xs text-brand/55">Today's Jobs</div>
                  <div className="text-2xl font-extrabold leading-tight">{stats.today}</div>
                  <div className="text-[11px] text-brand/50">{stats.pending} awaiting reply</div>
                </div>
              </div>
              <div className="min-w-0 pl-4">
                <div className="text-xs text-brand/55">Total Earned</div>
                <div className="truncate text-2xl font-extrabold leading-tight">{formatMoney(stats.earned, currency)}</div>
                <div className="text-[11px] text-brand/50">Paid & completed</div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 divide-x divide-[var(--soft-border)] border-t border-soft pt-4">
              <div className="pr-2">
                <div className="text-xs text-brand/55">Total Jobs</div>
                <div className="text-lg font-extrabold">{bookings.length}</div>
              </div>
              <div className="px-3">
                <div className="text-xs text-brand/55">Completed</div>
                <div className="text-lg font-extrabold">{stats.completed}</div>
              </div>
              <div className="pl-3">
                <div className="text-xs text-brand/55">Accept Rate</div>
                <div className="text-lg font-extrabold">{stats.acceptanceRate != null ? `${stats.acceptanceRate}%` : "—"}</div>
              </div>
            </div>
          </section>

          <Link
            to="/provider/$id"
            params={{ id: user!.id }}
            className="relative flex items-center gap-3 overflow-hidden rounded-2xl bg-gradient-to-br from-[#ff5a1f] to-[#ff8a3d] p-4 text-white shadow-[0_14px_30px_rgba(255,90,31,0.25)]"
          >
            <div className="pointer-events-none absolute -right-8 -top-10 size-32 rounded-full bg-white/15" />
            <div className="relative min-w-0 flex-1">
              <div className="text-lg font-bold leading-tight">More bookings</div>
              <div className="text-xs text-white/85">Keep your profile updated and stay active.</div>
            </div>
            <span className="relative flex shrink-0 items-center gap-1 rounded-full bg-white px-3.5 py-2 text-xs font-semibold text-accent">
              View profile <ArrowRight className="size-3.5" />
            </span>
          </Link>

          <section className={cn(card, "p-4")} aria-labelledby="m-quick">
            <h2 id="m-quick" className="text-base font-bold">Quick Actions</h2>
            <div className="mt-3 grid grid-cols-4 gap-y-4">
              <IconAction view="jobs" icon={Briefcase} tone="bg-blue-50 text-blue-600 dark:bg-blue-500/10" label="My Jobs" badge={stats.pending} />
              <IconAction view="schedule" icon={CalendarDays} tone="bg-orange-50 text-accent dark:bg-orange-500/10" label="Schedule" />
              <IconAction view="earnings" icon={Wallet} tone="bg-green-50 text-green-600 dark:bg-green-500/10" label="Earnings" />
              <IconAction view="availability" icon={Clock} tone="bg-violet-50 text-violet-600 dark:bg-violet-500/10" label="Availability" />
              <IconAction view="service-area" icon={MapPin} tone="bg-red-50 text-red-500 dark:bg-red-500/10" label="Service Area" />
              <IconAction view="portfolio" icon={Images} tone="bg-pink-50 text-pink-500 dark:bg-pink-500/10" label="Portfolio" />
              <IconAction onClick={() => goToListing("services-picker")} icon={Wrench} tone="bg-amber-50 text-amber-600 dark:bg-amber-500/10" label="Services" />
              <IconAction to="/payouts" icon={BarChart3} tone="bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-white/80" label="Payouts" />
            </div>
          </section>
        </div>
      </div>

      <div className="mx-auto max-w-[1240px] px-4 pt-4 lg:px-6 lg:pt-6">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6">
          <main className="space-y-4 lg:space-y-5">
            {/* ---------- Welcome + headline numbers ---------- */}
            <section className="relative hidden overflow-hidden rounded-2xl bg-[#0b1730] p-5 text-white shadow-[0_18px_40px_rgba(11,23,48,0.25)] sm:p-6 lg:block">
              <div className="pointer-events-none absolute -right-16 -top-24 size-80 rounded-full bg-accent/25 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-28 left-1/3 size-64 rounded-full bg-blue-500/15 blur-3xl" />
              <div className="relative flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <h1 className="text-2xl font-extrabold tracking-tight sm:text-[1.75rem]">
                    {greeting()}, {firstName} <span aria-hidden="true">👋</span>
                  </h1>
                  <p className="mt-1.5 text-sm text-white/75">Here's what's happening with your services today.</p>
                </div>
                <div className="flex items-center gap-3 rounded-xl bg-white/10 px-3.5 py-2.5 ring-1 ring-white/15 backdrop-blur">
                  <span className={cn("grid size-8 place-items-center rounded-full", form.is_active ? "bg-green-500" : "bg-white/20")}>
                    {form.is_active ? <CheckCircle2 className="size-4" /> : <Power className="size-4" />}
                  </span>
                  <div>
                    <div className="text-sm font-semibold">{form.is_active ? "Listing active" : "Listing paused"}</div>
                    <div className="text-xs text-white/65">{form.is_active ? "Customers can book you" : "Hidden from search"}</div>
                  </div>
                </div>
              </div>

              <div className="relative mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <HeroStat icon={CalendarDays} tone="bg-blue-50 text-blue-600" label="Today's Bookings" value={String(stats.today)} sub={`${stats.pending} awaiting reply`} />
                <HeroStat icon={Wallet} tone="bg-orange-50 text-accent" label="Total Earned" value={formatMoney(stats.earned, currency)} sub="Paid & completed jobs" />
                <HeroStat
                  icon={Star}
                  tone="bg-green-50 text-green-600"
                  label="Rating"
                  value={ratingStats.avg != null ? ratingStats.avg.toFixed(1) : "New"}
                  sub={`${ratingStats.count} ${ratingStats.count === 1 ? "review" : "reviews"}`}
                />
                <HeroStat icon={Briefcase} tone="bg-violet-50 text-violet-600" label="Completed Jobs" value={String(stats.completed)} sub={`${stats.accepted} in progress`} />
              </div>
            </section>

            {/* ---------- Earnings chart + recent bookings (desktop; mobile uses the Earnings and My Jobs screens) ---------- */}
            <div className="hidden grid-cols-1 gap-4 lg:grid lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-5">
              <section className={cn(card, "p-5")} aria-labelledby="overview">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 id="overview" className="flex items-center gap-2.5 text-base font-bold">
                    <BarChart3 className="size-5 text-brand/70" /> {chartMetric === "earnings" ? "Earnings" : "Bookings"} Overview
                  </h2>
                  <div className="flex rounded-full border border-soft bg-canvas p-0.5 text-xs font-semibold" role="tablist" aria-label="Chart metric">
                    {(["earnings", "bookings"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        role="tab"
                        aria-selected={chartMetric === m}
                        onClick={() => setChartMetric(m)}
                        className={cn("rounded-full px-3 py-1.5 capitalize transition", chartMetric === m ? "bg-surface text-accent shadow-sm" : "text-brand/55")}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-3">
                  <span className="text-3xl font-extrabold tracking-tight">{chartMetric === "earnings" ? formatMoney(headline, currency) : headline}</span>
                  {change != null && (
                    <span className={cn("flex items-center gap-0.5 text-sm font-semibold", change >= 0 ? "text-green-600" : "text-red-500")}>
                      {change >= 0 ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}
                      {Math.abs(change)}%
                    </span>
                  )}
                </div>
                <p className="text-xs text-brand/50">This week · last 8 weeks shown</p>
                <div className="mt-4">
                  {/* recharts is heavy, so the chart is lazy-loaded. */}
                  <Suspense fallback={<div className="h-56 animate-pulse rounded-xl bg-canvas sm:h-64" />}>
                    <DashboardCharts weeklyData={weeklyData} currency={currency} metric={chartMetric} />
                  </Suspense>
                </div>
              </section>

              <section className={cn(card, "p-5")} aria-labelledby="recent">
                <div className="flex items-center justify-between">
                  <h2 id="recent" className="text-base font-bold">Recent Bookings</h2>
                  <Link to="/bookings" className="flex items-center gap-1 text-xs font-semibold text-blue-600">
                    View all <ArrowRight className="size-3.5" />
                  </Link>
                </div>
                {bookings.length === 0 ? (
                  <p className="mt-6 text-sm text-brand/50">No bookings yet. New orders will appear here as customers book your services.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-[var(--soft-border)]">
                    {(bookings as any[]).slice(0, 5).map((b) => (
                      <li key={b.id} className="flex items-center gap-3 py-3">
                        <ServiceBadge slug={b.category?.slug} emoji={b.category?.icon} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold">{b.category?.name ?? "Booking"}</div>
                          <div className="truncate text-xs text-brand/50">
                            {b.customer?.full_name ?? "Customer"} · {formatRelativeTime(b.created_at)}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <StatusBadge status={b.status} />
                          {b.total_price != null && <span className="text-sm font-bold">{formatMoney(b.total_price, currency)}</span>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            {/* ---------- Upcoming jobs + performance ---------- */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-5">
              <section className={cn(card, "p-5")} aria-labelledby="schedule">
                <div className="flex items-center justify-between">
                  <h2 id="schedule" className="flex items-center gap-2.5 text-base font-bold">
                    <CalendarDays className="size-5 text-brand/70" /> Upcoming Jobs
                  </h2>
                  <Link to="/bookings" className="flex items-center gap-1 text-xs font-semibold text-blue-600">
                    View all <ArrowRight className="size-3.5" />
                  </Link>
                </div>
                {upcoming.length === 0 ? (
                  <p className="mt-6 text-sm text-brand/50">Nothing scheduled. New requests and accepted jobs show up here.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-[var(--soft-border)]">
                    {upcoming.map((b) => (
                      <li key={b.id} className="py-3">
                        <div className="flex items-center gap-3">
                          <ServiceBadge slug={b.category?.slug} emoji={b.category?.icon} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold">
                              {b.category?.name ?? "Booking"}
                              <span className="font-normal text-brand/50"> · {b.customer?.full_name ?? "Customer"}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-2 text-xs text-brand/55">
                              <span className="flex items-center gap-1">
                                <Clock className="size-3" />
                                {new Date(b.scheduled_at).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                              </span>
                              {b.address && <span className="truncate">· {b.address}</span>}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <StatusBadge status={b.status} />
                            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", getPaymentStatusBadge(b.payment_status))}>
                              {getPaymentStatusLabel(b.payment_status)}
                            </span>
                          </div>
                        </div>
                        {(b.status === "pending" || b.status === "accepted") && (
                          <div className="mt-2.5 flex gap-2 pl-[3.25rem]">
                            {b.status === "pending" ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => updateStatus(b.id, "accepted")}
                                  className="rounded-lg bg-accent px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-orange-500"
                                >
                                  Accept
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateStatus(b.id, "rejected")}
                                  className="rounded-lg border border-soft px-4 py-1.5 text-xs font-semibold transition hover:bg-canvas"
                                >
                                  Decline
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => updateStatus(b.id, "completed")}
                                className="rounded-lg bg-green-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-green-700"
                              >
                                Mark completed
                              </button>
                            )}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className={cn(card, "p-5")} aria-labelledby="performance">
                <div className="flex items-center justify-between">
                  <h2 id="performance" className="flex items-center gap-2.5 text-base font-bold">
                    <Star className="size-5 fill-[#0b1730] text-[#0b1730] dark:fill-white dark:text-white" /> Performance
                  </h2>
                  <span className="text-xs text-brand/50">All time</span>
                </div>
                <div className="mt-4 flex items-center gap-5">
                  <RatingRing value={ratingStats.avg} />
                  <ul className="flex-1 space-y-1.5">
                    {ratingStats.dist.map(({ star, pct }) => (
                      <li key={star} className="flex items-center gap-2 text-xs">
                        <span className="flex w-7 items-center gap-0.5 text-brand/70">
                          {star} <Star className="size-3 fill-current" />
                        </span>
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-canvas">
                          <span className="block h-full rounded-full bg-gradient-to-r from-accent to-orange-400" style={{ width: `${pct}%` }} />
                        </span>
                        <span className="w-8 text-right text-brand/55">{pct}%</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="mt-5 grid grid-cols-3 divide-x divide-[var(--soft-border)] border-t border-soft pt-4 text-center">
                  <MiniStat value={String(stats.completed)} label="Completed Jobs" />
                  <MiniStat value={String(ratingStats.count)} label="Total Reviews" />
                  <MiniStat value={stats.acceptanceRate != null ? `${stats.acceptanceRate}%` : "—"} label="Acceptance Rate" />
                </div>
              </section>
            </div>

            {/* ---------- Nudge banner ---------- */}
            <section className="relative flex flex-col gap-4 overflow-hidden rounded-2xl bg-[#0b1730] p-5 text-white sm:flex-row sm:items-center sm:p-6">
              <div className="pointer-events-none absolute -right-10 -top-16 size-56 rounded-full bg-accent/25 blur-3xl" />
              <span className="relative grid size-14 shrink-0 place-items-center rounded-full bg-gradient-to-br from-orange-400 to-accent shadow-lg shadow-accent/30">
                <Rocket className="size-6" />
              </span>
              <div className="relative min-w-0 flex-1">
                <div className="text-base font-bold">Need more bookings?</div>
                <p className="text-sm text-white/75">Complete your listing, add more services, and keep your availability up to date.</p>
              </div>
              <button
                type="button"
                onClick={() => goToListing("listing")}
                className="relative flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent to-orange-500 px-5 py-2.5 text-sm font-semibold shadow-lg shadow-accent/30 transition hover:brightness-105"
              >
                Edit listing <ArrowRight className="size-4" />
              </button>
            </section>

            {/* ---------- Listing editor ---------- */}
            <form id="listing" onSubmit={save} className="scroll-mt-28 grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
              <section className={cn(card, "p-5")} aria-labelledby="listing-details">
                <div className="flex items-center justify-between gap-4">
                  <h2 id="listing-details" className="text-base font-bold">Listing details</h2>
                  <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium">
                    <span className={form.is_active ? "text-green-600" : "text-brand/50"}>{form.is_active ? "Active" : "Paused"}</span>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={form.is_active}
                      onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                      className="peer sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className="relative h-6 w-11 rounded-full bg-brand/15 transition after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:bg-green-500 peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-accent"
                    />
                  </label>
                </div>
                <div className="mt-5 space-y-4">
                  <Input label="Business name" required value={form.business_name} onChange={(v) => setForm({ ...form, business_name: v })} />
                  <Input label="Bio" textarea value={form.bio} onChange={(v) => setForm({ ...form, bio: v })} placeholder="Tell customers what you do and why they should book you" />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input label={`Hourly rate (${currencySymbol(currency)})`} value={form.hourly_rate} type="number" onChange={(v) => setForm({ ...form, hourly_rate: v })} />
                    <Input label="Service radius (km)" value={String(form.service_radius_km)} type="number" onChange={(v) => setForm({ ...form, service_radius_km: Number(v) || 0 })} />
                  </div>
                  <Input label="Phone" type="tel" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
                  <Input
                    id="availability-input"
                    label="Availability"
                    value={form.availability_note}
                    onChange={(v) => setForm({ ...form, availability_note: v })}
                    placeholder="e.g. Mon – Sat, 8am – 6pm"
                  />
                </div>
              </section>

              <section id="service-area" className={cn(card, "scroll-mt-28 p-5")} aria-labelledby="service-area-title">
                <h2 id="service-area-title" className="text-base font-bold">Service area</h2>
                <div className="mt-5 space-y-4">
                  <Input id="address-input" label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input label="City" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
                    <Input label="ZIP" value={form.zip} onChange={(v) => setForm({ ...form, zip: v })} />
                  </div>
                  <button
                    type="button"
                    onClick={geocodeAddress}
                    disabled={geocoding}
                    className={cn(
                      "flex h-11 w-full items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition disabled:opacity-60",
                      pinned ? "border-green-200 bg-green-50 text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-400" : "border-soft hover:bg-canvas",
                    )}
                  >
                    {geocoding ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}
                    {pinned ? `Pinned (${form.latitude!.toFixed(3)}, ${form.longitude!.toFixed(3)}) · Re-pin` : "Pin on map"}
                  </button>
                </div>

                <div id="services-picker" className="mt-6 scroll-mt-28">
                  <h3 className="text-sm font-semibold">Services you offer</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {categories.map((c: any) => {
                      const on = selectedCats.includes(c.id);
                      return (
                        <button
                          type="button"
                          key={c.id}
                          aria-pressed={on}
                          onClick={() => setSelectedCats(on ? selectedCats.filter((x) => x !== c.id) : [...selectedCats, c.id])}
                          className={cn(
                            "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition",
                            on ? "border-accent bg-accent text-white" : "border-soft bg-surface hover:border-accent/30",
                          )}
                        >
                          <CategoryIcon slug={c.slug} emoji={c.icon} className={cn("size-3.5 text-sm", on && "text-white")} /> {c.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent to-orange-500 text-sm font-semibold text-white shadow-lg shadow-accent/25 transition hover:brightness-105 disabled:opacity-60"
                >
                  {saving && <Loader2 className="size-4 animate-spin" />} Save listing
                </button>
              </section>
            </form>
          </main>

          {/* ---------- Side column (stacks below on mobile) ---------- */}
          <aside className="mt-4 space-y-4 lg:sticky lg:top-24 lg:mt-0 lg:space-y-5">
            <Link
              to="/provider/$id"
              params={{ id: user!.id }}
              className="relative hidden overflow-hidden rounded-2xl bg-gradient-to-br lg:block from-[#ff5a1f] to-[#ff8a3d] p-5 text-white shadow-[0_18px_40px_rgba(255,90,31,0.25)] transition hover:brightness-105"
            >
              <div className="pointer-events-none absolute -bottom-12 -right-10 size-40 rounded-full bg-white/15" />
              <div className="relative flex items-start gap-4">
                <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-white text-blue-600 shadow-md">
                  <Eye className="size-6" />
                </span>
                <div>
                  <div className="text-lg font-bold leading-tight">More bookings, more earnings</div>
                  <p className="mt-1 text-xs text-white/85">See your listing the way customers do and keep it fresh.</p>
                </div>
              </div>
              <span className="relative mt-4 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-semibold text-accent">
                View public profile <ArrowRight className="size-3.5" />
              </span>
            </Link>

            <section className={cn(card, "hidden p-5 lg:block")} aria-labelledby="quick">
              <h2 id="quick" className="text-base font-bold">Quick Actions</h2>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <ActionTile to="/bookings" icon={CalendarCheck} tone="bg-orange-500" title="View Bookings" subtitle="Check your schedule" />
                <ActionTile onClick={() => goToListing("listing", "availability-input")} icon={Clock} tone="bg-violet-500" title="Update Availability" subtitle="Set your hours" />
                <ActionTile onClick={() => goToListing("services-picker")} icon={Wrench} tone="bg-green-600" title="Manage Services" subtitle="Edit services & rate" />
                <ActionTile to="/payouts" icon={Wallet} tone="bg-blue-600" title="Payouts" subtitle="Withdraw earnings" />
              </div>
              {business && (
                <Link to="/business" className="mt-3 flex items-center gap-3 rounded-xl border border-soft px-3 py-2.5 text-sm font-semibold transition hover:bg-canvas">
                  <Store className="size-4 text-brand/60" />
                  <span className="flex-1">Business & team tools</span>
                  <ChevronRight className="size-4 text-brand/40" />
                </Link>
              )}
            </section>

            <button type="button" onClick={() => goToListing("service-area", "address-input")} className={cn(card, "flex w-full items-center gap-3 p-5 text-left transition hover:border-accent/30")}>
              <MapPin className="size-5 shrink-0 fill-[#0b1730] text-[#0b1730] [&>circle]:fill-white dark:fill-white dark:text-white dark:[&>circle]:fill-black" />
              <span className="min-w-0 flex-1">
                <span className="block text-base font-bold">Your Service Area</span>
                <span className="mt-1.5 block truncate text-sm font-semibold">{form.city || "Set your city"}</span>
                <span className="block text-xs text-brand/55">Service radius: up to {form.service_radius_km}km</span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-brand/40" />
            </button>

            <section className={cn(card, "p-5")} aria-labelledby="status">
              <h2 id="status" className="flex items-center gap-2.5 text-base font-bold">
                <ShieldCheck className="size-5 fill-[#0b1730] text-white dark:fill-white dark:text-black" /> Account Status
              </h2>
              <ul className="mt-3 space-y-2.5">
                {accountItems.map(({ label, ok }) => (
                  <li key={label} className="flex items-center gap-2.5 text-sm">
                    {ok ? <CheckCircle2 className="size-4 shrink-0 fill-green-500 text-white" /> : <Circle className="size-4 shrink-0 text-brand/30" />}
                    <span className={cn("flex-1", !ok && "text-brand/60")}>{label}</span>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                        ok ? "bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-400" : "bg-orange-50 text-accent dark:bg-orange-500/15",
                      )}
                    >
                      {ok ? "Done" : "To do"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            {topRated && (
              <div className={cn(card, "flex items-center gap-3 bg-gradient-to-r from-blue-50 to-surface p-4 dark:from-blue-500/10")}>
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
                  <Crown className="size-5" />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-bold">Top Rated Provider</div>
                  <div className="text-xs text-brand/55">Averaging {ratingStats.avg!.toFixed(1)}★ across {ratingStats.count} reviews</div>
                </div>
              </div>
            )}

            {form.phone && (
              <p className="flex items-center gap-2 px-1 text-xs text-brand/45">
                <Phone className="size-3.5" /> Customers can call you on {form.phone}
              </p>
            )}
          </aside>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}

/* ---------- Building blocks ---------- */

function HeroStat({ icon: Icon, tone, label, value, sub }: { icon: LucideIcon; tone: string; label: string; value: string; sub: string }) {
  return (
    <div className="light-surface flex items-start gap-3 rounded-xl bg-white p-3.5 text-brand shadow-lg shadow-black/10 sm:p-4">
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl dark:bg-opacity-100", tone)}>
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <div className="truncate text-xs text-brand/60">{label}</div>
        <div className="mt-0.5 truncate text-lg font-extrabold leading-tight sm:text-xl">{value}</div>
        <div className="mt-0.5 truncate text-[11px] text-brand/50">{sub}</div>
      </div>
    </div>
  );
}

function ServiceBadge({ slug, emoji }: { slug?: string; emoji?: string | null }) {
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-orange-50 dark:bg-orange-500/10">
      {slug ? <CategoryIcon slug={slug} emoji={emoji ?? null} className="size-5 text-lg" /> : <Wrench className="size-5 text-accent" />}
    </span>
  );
}

// Circular gauge for the average rating (out of 5).
function RatingRing({ value }: { value: number | null }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const pct = value != null ? value / 5 : 0;
  return (
    <div className="relative size-28 shrink-0">
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--border)" strokeWidth="9" />
        <circle cx="50" cy="50" r={r} fill="none" stroke="url(#ring)" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${pct * c} ${c}`} />
        <defs>
          <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ff5a1f" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="text-2xl font-extrabold leading-none">{value != null ? value.toFixed(1) : "—"}</div>
          <div className="mt-1 text-xs text-brand/55">Rating</div>
        </div>
      </div>
    </div>
  );
}

function IconAction({
  view,
  to,
  onClick,
  icon: Icon,
  tone,
  label,
  badge,
}: {
  view?: DashboardView;
  to?: string;
  onClick?: () => void;
  icon: LucideIcon;
  tone: string;
  label: string;
  badge?: number;
}) {
  const className = "flex flex-col items-center gap-1.5 text-center";
  const content = (
    <>
      <span className={cn("relative grid size-12 place-items-center rounded-full", tone)}>
        <Icon className="size-5" />
        {!!badge && (
          <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-white ring-2 ring-white dark:ring-black">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </span>
      <span className="text-[11px] font-medium leading-tight">{label}</span>
    </>
  );
  if (view) {
    return (
      <Link to="/dashboard" search={{ view }} className={className}>
        {content}
      </Link>
    );
  }
  if (to) {
    return (
      <Link to={to} className={className}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}

function MiniStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="px-1">
      <div className="text-base font-bold text-blue-700 dark:text-blue-400">{value}</div>
      <div className="text-[11px] leading-tight text-brand/55">{label}</div>
    </div>
  );
}

function ActionTile({
  to,
  onClick,
  icon: Icon,
  tone,
  title,
  subtitle,
}: {
  to?: string;
  onClick?: () => void;
  icon: LucideIcon;
  tone: string;
  title: string;
  subtitle: string;
}) {
  const className = "flex flex-col items-start rounded-xl border border-soft bg-canvas/60 p-3.5 text-left transition hover:-translate-y-0.5 hover:shadow-md";
  const content = (
    <>
      <span className={cn("grid size-9 place-items-center rounded-lg text-white shadow-sm", tone)}>
        <Icon className="size-4" />
      </span>
      <span className="mt-2.5 text-[13px] font-semibold leading-snug">{title}</span>
      <span className="mt-0.5 text-[11px] text-brand/55">{subtitle}</span>
    </>
  );
  if (to) {
    return (
      <Link to={to} className={className}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}

function Input({
  id,
  label,
  value,
  onChange,
  type = "text",
  required,
  textarea,
  placeholder,
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  textarea?: boolean;
  placeholder?: string;
}) {
  const field =
    "w-full rounded-xl border border-soft bg-canvas px-3.5 py-2.5 text-sm outline-none transition focus:border-accent/50 focus:ring-4 focus:ring-accent/10";
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">
        {label}
        {required && <span className="text-accent"> *</span>}
      </span>
      {textarea ? (
        <textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} rows={3} placeholder={placeholder} className={cn(field, "resize-none")} />
      ) : (
        <input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required} placeholder={placeholder} className={field} />
      )}
    </label>
  );
}
