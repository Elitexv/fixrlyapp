import { lazy, Suspense, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  ImagePlus,
  Loader2,
  MapPin,
  MessageSquare,
  Phone,
  Trash2,
  Wallet,
  CheckCircle2,
  Receipt,
  Hourglass,
  Navigation,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getOrCreateConversation } from "@/lib/chat";
import { uploadUserFile } from "@/lib/storage";
import { formatMoney } from "@/lib/currency";
import { getPaymentStatusBadge, getPaymentStatusLabel } from "@/lib/booking-payment";
import { GoogleMap } from "@/components/GoogleMap";
import { CategoryIcon } from "@/components/CategoryVisual";
import { StatusBadge } from "@/components/ui-kit";
import { BottomNav, DesktopSidebar } from "@/components/BottomNav";
import { AppTopBar } from "@/components/AppTopBar";
import { cn } from "@/lib/utils";

const DashboardCharts = lazy(() => import("@/components/DashboardCharts"));

// Screens reachable from the provider dashboard's quick actions. Each is a
// focused, mobile-first page (`/dashboard?view=…`) built on the same data
// and save logic the dashboard already owns — passed in as props so there's
// still exactly one copy of the bookings query and the listing form.
export type DashboardView = "jobs" | "schedule" | "earnings" | "availability" | "service-area" | "portfolio";

export const card = "rounded-2xl border border-soft bg-surface shadow-[0_8px_30px_rgba(15,23,42,0.06)]";

export type ListingForm = {
  business_name: string;
  bio: string;
  hourly_rate: string;
  service_radius_km: number;
  address: string;
  city: string;
  zip: string;
  phone: string;
  availability_note: string;
  is_active: boolean;
  latitude: number | null;
  longitude: number | null;
};

/* ---------- Shell: navy header with back button ---------- */

export function ViewShell({
  title,
  action,
  footer,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <div className={cn("min-h-screen bg-canvas text-brand", footer ? "pb-28" : "pb-32 lg:pb-12")}>
      <AppTopBar />
      {/* Screens with their own Save bar drop the bottom tab bar on mobile
          so the two fixed bars don't stack. */}
      {footer ? <DesktopSidebar /> : <BottomNav />}
      <header className="sticky top-0 z-30 bg-[#0b1730] text-white lg:static lg:mx-auto lg:mt-6 lg:max-w-2xl lg:rounded-2xl">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3.5 lg:pt-3.5">
          <button
            type="button"
            onClick={() => navigate({ to: "/dashboard", search: {} })}
            aria-label="Back to dashboard"
            className="grid size-10 place-items-center rounded-full transition hover:bg-white/10"
          >
            <ArrowLeft className="size-5" />
          </button>
          <h1 className="flex-1 text-lg font-bold">{title}</h1>
          {action}
        </div>
      </header>
      <main className="mx-auto max-w-2xl space-y-4 px-4 pt-4">{children}</main>
      {footer && (
        <div className="light-surface fixed inset-x-0 bottom-0 z-40 border-t border-soft bg-white/95 p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] backdrop-blur-xl lg:static lg:mx-auto lg:mt-4 lg:max-w-2xl lg:border-0 lg:bg-transparent lg:px-4 lg:pb-0">
          {footer}
        </div>
      )}
    </div>
  );
}

export function PrimaryAction({ onClick, loading, children, type = "button" }: { onClick?: () => void; loading?: boolean; children: React.ReactNode; type?: "button" | "submit" }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={loading}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent to-orange-500 text-sm font-semibold text-white shadow-lg shadow-accent/25 transition hover:brightness-105 disabled:opacity-60"
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

function ServiceBadge({ slug, emoji }: { slug?: string; emoji?: string | null }) {
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-orange-50 dark:bg-orange-500/10">
      {slug ? <CategoryIcon slug={slug} emoji={emoji ?? null} className="size-5 text-lg" /> : <Wrench className="size-5 text-accent" />}
    </span>
  );
}

const fmtDateTime = (d: string) =>
  new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

/* ---------- My Jobs ---------- */

type JobTab = "active" | "completed" | "cancelled";
const tabFor = (status: string): JobTab =>
  status === "completed" ? "completed" : status === "rejected" || status === "cancelled" ? "cancelled" : "active";

export function JobsView({
  bookings,
  providerId,
  currency,
  updateStatus,
}: {
  bookings: any[];
  providerId: string;
  currency: string;
  updateStatus: (id: string, status: "accepted" | "rejected" | "completed") => void;
}) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<JobTab>("active");
  const [openId, setOpenId] = useState<string | null>(null);
  const [chatting, setChatting] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c = { active: 0, completed: 0, cancelled: 0 };
    for (const b of bookings) c[tabFor(b.status)]++;
    return c;
  }, [bookings]);
  const list = bookings.filter((b) => tabFor(b.status) === tab);

  const chat = async (customerId: string) => {
    setChatting(customerId);
    try {
      const id = await getOrCreateConversation(providerId, customerId);
      window.sessionStorage.setItem("selectedConversationId", id);
    } catch {
      /* fall through to the inbox — the thread may still be listed there */
    } finally {
      setChatting(null);
      navigate({ to: "/messages" });
    }
  };

  return (
    <ViewShell title="My Jobs">
      <div className="flex gap-2 overflow-x-auto no-scrollbar" role="tablist">
        {(["active", "completed", "cancelled"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              "shrink-0 rounded-full px-4 py-2 text-sm font-semibold capitalize transition",
              tab === t ? "bg-accent text-white shadow-md shadow-accent/25" : "bg-surface text-brand/65 ring-1 ring-[var(--soft-border)]",
            )}
          >
            {t} ({counts[t]})
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className={cn(card, "px-6 py-12 text-center text-sm text-brand/55")}>No {tab} jobs.</div>
      ) : (
        list.map((b) => {
          const open = openId === b.id;
          return (
            <article key={b.id} className={cn(card, "p-4")}>
              <div className="flex items-start gap-3">
                <ServiceBadge slug={b.category?.slug} emoji={b.category?.icon} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="truncate text-[15px] font-bold">{b.category?.name ?? "Booking"}</h2>
                    <StatusBadge status={b.status} />
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-brand/55">
                    <CalendarDays className="size-3.5" /> {fmtDateTime(b.scheduled_at)}
                  </div>
                  {b.address && (
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-brand/55">
                      <MapPin className="size-3.5 shrink-0" /> <span className="truncate">{b.address}</span>
                    </div>
                  )}
                  {b.total_price != null && <div className="mt-2 text-base font-extrabold">{formatMoney(b.total_price, currency)}</div>}
                </div>
              </div>

              {open && (
                <div className="mt-4 space-y-3 border-t border-soft pt-4 text-sm">
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-canvas font-bold text-brand/60">
                      {b.customer?.avatar_url ? <img src={b.customer.avatar_url} alt="" className="h-full w-full object-cover" /> : (b.customer?.full_name ?? "C")[0]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{b.customer?.full_name ?? "Customer"}</div>
                      <div className="text-xs text-brand/55">{b.customer?.phone ?? "No phone on file"}</div>
                    </div>
                    <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider", getPaymentStatusBadge(b.payment_status))}>
                      {getPaymentStatusLabel(b.payment_status)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {b.customer?.phone ? (
                      <a href={`tel:${b.customer.phone}`} className="flex h-10 items-center justify-center gap-2 rounded-xl border border-soft font-medium transition hover:bg-canvas">
                        <Phone className="size-4" /> Call
                      </a>
                    ) : (
                      <span className="flex h-10 items-center justify-center gap-2 rounded-xl border border-soft font-medium text-brand/35">
                        <Phone className="size-4" /> Call
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => chat(b.customer_id)}
                      disabled={chatting === b.customer_id}
                      className="flex h-10 items-center justify-center gap-2 rounded-xl border border-soft font-medium transition hover:bg-canvas disabled:opacity-60"
                    >
                      {chatting === b.customer_id ? <Loader2 className="size-4 animate-spin" /> : <MessageSquare className="size-4" />} Chat
                    </button>
                  </div>
                  {b.notes && (
                    <div>
                      <div className="text-xs font-semibold text-brand/60">Job description</div>
                      <p className="mt-1 rounded-xl bg-canvas p-3 text-sm text-brand/75">{b.notes}</p>
                    </div>
                  )}
                  <div className="text-xs text-brand/55">
                    {b.duration_hours}h booked{b.booking_number ? ` · #${b.booking_number}` : ""}
                  </div>
                  {b.status === "pending" && (
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => updateStatus(b.id, "accepted")} className="h-10 rounded-xl bg-accent font-semibold text-white transition hover:bg-orange-500">
                        Accept
                      </button>
                      <button type="button" onClick={() => updateStatus(b.id, "rejected")} className="h-10 rounded-xl border border-soft font-semibold transition hover:bg-canvas">
                        Decline
                      </button>
                    </div>
                  )}
                  {(b.status === "accepted" || b.status === "on_the_way") && (
                    <div className="grid grid-cols-2 gap-2">
                      {/* Live location sharing runs on the bookings page. */}
                      <Link to="/bookings" className="flex h-10 items-center justify-center gap-2 rounded-xl border border-soft font-semibold transition hover:bg-canvas">
                        <Navigation className="size-4" /> {b.status === "on_the_way" ? "Tracking" : "On my way"}
                      </Link>
                      <button type="button" onClick={() => updateStatus(b.id, "completed")} className="h-10 rounded-xl bg-green-600 font-semibold text-white transition hover:bg-green-700">
                        Mark completed
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : b.id)}
                  aria-expanded={open}
                  className="flex h-10 flex-1 items-center justify-center rounded-xl bg-gradient-to-r from-accent to-orange-500 text-sm font-semibold text-white shadow-md shadow-accent/20 transition hover:brightness-105"
                >
                  {open ? "Hide Details" : "View Details"}
                </button>
                <button
                  type="button"
                  onClick={() => chat(b.customer_id)}
                  aria-label="Chat with customer"
                  className="grid h-10 w-16 place-items-center rounded-xl border border-soft transition hover:bg-canvas"
                >
                  <MessageSquare className="size-4" />
                </button>
              </div>
            </article>
          );
        })
      )}
    </ViewShell>
  );
}

/* ---------- Schedule ---------- */

const startOfWeek = (d: Date) => {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  date.setHours(0, 0, 0, 0);
  return date;
};

export function ScheduleView({ bookings }: { bookings: any[] }) {
  const [selected, setSelected] = useState(() => new Date());
  const weekStart = startOfWeek(selected);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
  const shiftWeek = (n: number) => {
    const d = new Date(selected);
    d.setDate(d.getDate() + n * 7);
    setSelected(d);
  };
  const live = bookings.filter((b) => b.status !== "rejected" && b.status !== "cancelled");
  const countOn = (d: Date) => live.filter((b) => new Date(b.scheduled_at).toDateString() === d.toDateString()).length;
  const dayJobs = live
    .filter((b) => new Date(b.scheduled_at).toDateString() === selected.toDateString())
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  return (
    <ViewShell
      title="My Schedule"
      action={
        <button type="button" onClick={() => setSelected(new Date())} className="rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-white/25 transition hover:bg-white/10">
          Today
        </button>
      }
    >
      <section className={cn(card, "p-3")}>
        <div className="mb-2 flex items-center justify-between px-1">
          <button type="button" onClick={() => shiftWeek(-1)} aria-label="Previous week" className="grid size-8 place-items-center rounded-full hover:bg-canvas">
            <ChevronLeft className="size-4" />
          </button>
          <span className="text-sm font-semibold">{weekStart.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
          <button type="button" onClick={() => shiftWeek(1)} aria-label="Next week" className="grid size-8 place-items-center rounded-full hover:bg-canvas">
            <ChevronRight className="size-4" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((d) => {
            const active = d.toDateString() === selected.toDateString();
            const n = countOn(d);
            return (
              <button
                key={d.toISOString()}
                type="button"
                onClick={() => setSelected(d)}
                aria-pressed={active}
                className={cn("flex flex-col items-center gap-0.5 rounded-xl py-2 transition", active ? "bg-accent text-white shadow-md shadow-accent/30" : "hover:bg-canvas")}
              >
                <span className={cn("text-[11px]", active ? "text-white/85" : "text-brand/55")}>{d.toLocaleDateString(undefined, { weekday: "short" })}</span>
                <span className="text-base font-bold">{d.getDate()}</span>
                <span className={cn("size-1.5 rounded-full", n ? (active ? "bg-white" : "bg-accent") : "bg-transparent")} />
              </button>
            );
          })}
        </div>
      </section>

      <section className={cn(card, "divide-y divide-[var(--soft-border)]")} aria-label="Jobs on selected day">
        {dayJobs.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-brand/55">No jobs on {selected.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}.</p>
        ) : (
          dayJobs.map((b) => {
            const start = new Date(b.scheduled_at);
            const end = new Date(start.getTime() + (Number(b.duration_hours) || 1) * 3600_000);
            return (
              <div key={b.id} className="flex items-start gap-3 p-4">
                <ServiceBadge slug={b.category?.slug} emoji={b.category?.icon} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-brand/55">
                    {time(start)} – {time(end)}
                  </div>
                  <div className="truncate text-[15px] font-bold">{b.category?.name ?? "Booking"}</div>
                  <div className="truncate text-xs text-brand/55">
                    {b.customer?.full_name ?? "Customer"}
                    {b.address ? ` · ${b.address}` : ""}
                  </div>
                </div>
                <StatusBadge status={b.status} />
              </div>
            );
          })
        )}
      </section>
    </ViewShell>
  );
}

/* ---------- Earnings ---------- */

type Range = "7d" | "30d" | "90d";
const RANGES: { id: Range; label: string; days: number }[] = [
  { id: "7d", label: "7 days", days: 7 },
  { id: "30d", label: "30 days", days: 30 },
  { id: "90d", label: "3 months", days: 90 },
];

export function EarningsView({ bookings, providerId, currency }: { bookings: any[]; providerId: string; currency: string }) {
  const [range, setRange] = useState<Range>("30d");
  const days = RANGES.find((r) => r.id === range)!.days;

  const { data: balance } = useQuery({
    queryKey: ["provider-balance", providerId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("provider_available_balance", { _provider_id: providerId });
      if (error) throw error;
      return Number(data) || 0;
    },
  });

  // Same "earned" definition as the dashboard: net payout on bookings that
  // are both completed and paid, dated by when they were paid.
  const { chart, total, prevTotal, breakdown } = useMemo(() => {
    const now = new Date();
    now.setHours(23, 59, 59, 999);
    const from = new Date(now);
    from.setDate(from.getDate() - days + 1);
    from.setHours(0, 0, 0, 0);
    const prevFrom = new Date(from);
    prevFrom.setDate(prevFrom.getDate() - days);

    const earned = bookings.filter((b) => b.status === "completed" && b.payment_status === "paid" && b.paid_at);
    const inRange = earned.filter((b) => new Date(b.paid_at) >= from && new Date(b.paid_at) <= now);
    const inPrev = earned.filter((b) => new Date(b.paid_at) >= prevFrom && new Date(b.paid_at) < from);
    const payout = (b: any) => Number(b.provider_payout_amount) || 0;

    // Daily bars up to a month, weekly beyond that, so bars stay readable.
    const bucketDays = days > 31 ? 7 : 1;
    const buckets: { week: string; earnings: number; bookings: number; start: number }[] = [];
    for (let t = from.getTime(); t <= now.getTime(); t += bucketDays * 86400_000) {
      const d = new Date(t);
      buckets.push({ week: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }), earnings: 0, bookings: 0, start: t });
    }
    for (const b of inRange) {
      const idx = Math.floor((new Date(b.paid_at).getTime() - from.getTime()) / (bucketDays * 86400_000));
      if (buckets[idx]) {
        buckets[idx].earnings += payout(b);
        buckets[idx].bookings += 1;
      }
    }

    const gross = inRange.reduce((s, b) => s + (Number(b.total_price) || 0), 0);
    const net = inRange.reduce((s, b) => s + payout(b), 0);
    const awaiting = bookings
      .filter((b) => b.status === "completed" && b.payment_status !== "paid")
      .reduce((s, b) => s + (Number(b.total_price) || 0), 0);

    return {
      chart: buckets,
      total: net,
      prevTotal: inPrev.reduce((s, b) => s + payout(b), 0),
      breakdown: { jobs: inRange.length, gross, fees: Math.max(0, gross - net), awaiting },
    };
  }, [bookings, days]);

  const change = prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null;
  const rows: { icon: LucideIcon; tone: string; label: string; value: string }[] = [
    { icon: CheckCircle2, tone: "bg-green-50 text-green-600 dark:bg-green-500/10", label: `Completed jobs (${breakdown.jobs})`, value: formatMoney(breakdown.gross, currency) },
    { icon: Receipt, tone: "bg-violet-50 text-violet-600 dark:bg-violet-500/10", label: "Platform fees", value: `−${formatMoney(breakdown.fees, currency)}` },
    { icon: Wallet, tone: "bg-orange-50 text-accent dark:bg-orange-500/10", label: "Your earnings", value: formatMoney(total, currency) },
    { icon: Hourglass, tone: "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-white/70", label: "Completed, awaiting payment", value: formatMoney(breakdown.awaiting, currency) },
  ];

  return (
    <ViewShell
      title="Earnings"
      footer={
        <Link
          to="/payouts"
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent to-orange-500 text-sm font-semibold text-white shadow-lg shadow-accent/25 transition hover:brightness-105"
        >
          <Wallet className="size-4" /> Withdraw Earnings{balance != null ? ` · ${formatMoney(balance, currency)} available` : ""}
        </Link>
      }
    >
      <section className={cn(card, "p-4 sm:p-5")}>
        <div className="text-sm text-brand/60">Total earnings</div>
        <div className="mt-1 flex items-baseline gap-3">
          <span className="text-3xl font-extrabold tracking-tight">{formatMoney(total, currency)}</span>
          {change != null && (
            <span className={cn("flex items-center gap-0.5 text-sm font-semibold", change >= 0 ? "text-green-600" : "text-red-500")}>
              {change >= 0 ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}
              {Math.abs(change)}%
            </span>
          )}
        </div>
        <div className="text-xs text-brand/50">Last {RANGES.find((r) => r.id === range)!.label}</div>
        <div className="mt-4">
          <Suspense fallback={<div className="h-56 animate-pulse rounded-xl bg-canvas" />}>
            <DashboardCharts weeklyData={chart} currency={currency} metric="earnings" />
          </Suspense>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1 rounded-full bg-canvas p-1" role="tablist" aria-label="Date range">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              role="tab"
              aria-selected={range === r.id}
              onClick={() => setRange(r.id)}
              className={cn("rounded-full py-2 text-xs font-semibold transition", range === r.id ? "bg-accent text-white shadow" : "text-brand/60")}
            >
              {r.label}
            </button>
          ))}
        </div>
      </section>

      <section className={cn(card, "p-4 sm:p-5")}>
        <h2 className="text-base font-bold">Earnings Breakdown</h2>
        <ul className="mt-2 divide-y divide-[var(--soft-border)]">
          {rows.map(({ icon: Icon, tone, label, value }) => (
            <li key={label} className="flex items-center gap-3 py-3 text-sm">
              <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", tone)}>
                <Icon className="size-4" />
              </span>
              <span className="flex-1">{label}</span>
              <span className="font-semibold">{value}</span>
            </li>
          ))}
        </ul>
      </section>
    </ViewShell>
  );
}

/* ---------- Availability ---------- */

const AVAILABILITY_PRESETS = ["Mon – Fri, 8am – 6pm", "Mon – Sat, 8am – 8pm", "Every day, 8am – 8pm", "Weekends only", "Evenings, 5pm – 9pm", "24/7 emergency"];

export function AvailabilityView({
  form,
  setForm,
  saving,
  onSave,
}: {
  form: ListingForm;
  setForm: (f: ListingForm) => void;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <ViewShell title="Availability" footer={<PrimaryAction onClick={onSave} loading={saving}>Save Changes</PrimaryAction>}>
      <section className={cn(card, "flex items-center gap-3 p-4")}>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold">Accepting bookings</div>
          <div className="text-xs text-brand/55">{form.is_active ? "Customers can find and book you" : "You're hidden from search"}</div>
        </div>
        <Switch checked={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} label="Accepting bookings" />
      </section>

      <section className={cn(card, "p-4")}>
        <label htmlFor="availability-note" className="text-[15px] font-semibold">
          Working hours
        </label>
        <p className="mt-0.5 text-xs text-brand/55">Shown on your public profile.</p>
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-soft bg-canvas px-3.5 py-3 focus-within:border-accent/50 focus-within:ring-4 focus-within:ring-accent/10">
          <Clock className="size-4 shrink-0 text-brand/45" />
          <input
            id="availability-note"
            value={form.availability_note}
            onChange={(e) => setForm({ ...form, availability_note: e.target.value })}
            placeholder="e.g. Mon – Sat, 8am – 6pm"
            className="w-full min-w-0 bg-transparent text-sm outline-none"
          />
        </div>
        <div className="mt-4 text-xs font-semibold text-brand/60">Quick pick</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {AVAILABILITY_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setForm({ ...form, availability_note: p })}
              aria-pressed={form.availability_note === p}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                form.availability_note === p ? "border-accent bg-accent text-white" : "border-soft hover:border-accent/30",
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </section>
    </ViewShell>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn("relative h-7 w-12 shrink-0 rounded-full transition", checked ? "bg-blue-600" : "bg-brand/15")}
    >
      <span className={cn("absolute left-0.5 top-0.5 size-6 rounded-full bg-white shadow transition", checked && "translate-x-5")} />
    </button>
  );
}

/* ---------- Service area ---------- */

export function ServiceAreaView({
  form,
  setForm,
  saving,
  onSave,
  geocoding,
  onPin,
}: {
  form: ListingForm;
  setForm: (f: ListingForm) => void;
  saving: boolean;
  onSave: () => void;
  geocoding: boolean;
  onPin: () => void;
}) {
  const hasPin = form.latitude != null && form.longitude != null;
  // Rough zoom so the whole radius fits the small map.
  const zoom = form.service_radius_km > 60 ? 8 : form.service_radius_km > 30 ? 9 : form.service_radius_km > 12 ? 10 : 11;
  return (
    <ViewShell title="Service Area" footer={<PrimaryAction onClick={onSave} loading={saving}>Save Changes</PrimaryAction>}>
      <section className={cn(card, "relative overflow-hidden")}>
        <div className="h-56">
          {hasPin ? (
            <GoogleMap center={{ lat: form.latitude!, lng: form.longitude! }} markers={[{ lat: form.latitude!, lng: form.longitude! }]} zoom={zoom} />
          ) : (
            <div className="grid h-full place-items-center bg-canvas px-6 text-center text-sm text-brand/55">
              <div>
                <MapPin className="mx-auto mb-2 size-7 text-brand/30" />
                Add your address and pin it to show your area on the map.
              </div>
            </div>
          )}
        </div>
        <span className="absolute right-3 top-3 rounded-full bg-surface px-2.5 py-1 text-xs font-semibold shadow">⊙ {form.service_radius_km} km</span>
      </section>

      <section className={cn(card, "p-4")}>
        <label htmlFor="radius" className="flex items-center justify-between text-[15px] font-semibold">
          Service radius <span className="text-accent">{form.service_radius_km} km</span>
        </label>
        <input
          id="radius"
          type="range"
          min={1}
          max={100}
          value={form.service_radius_km}
          onChange={(e) => setForm({ ...form, service_radius_km: Number(e.target.value) })}
          className="mt-3 w-full accent-[#ff5a1f]"
        />
        <div className="flex justify-between text-[11px] text-brand/45">
          <span>1 km</span>
          <span>100 km</span>
        </div>
      </section>

      <section className={cn(card, "space-y-3 p-4")}>
        <div className="text-[15px] font-semibold">Base location</div>
        <AreaInput label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v, latitude: null, longitude: null })} />
        <div className="grid grid-cols-2 gap-3">
          <AreaInput label="City" value={form.city} onChange={(v) => setForm({ ...form, city: v, latitude: null, longitude: null })} />
          <AreaInput label="ZIP" value={form.zip} onChange={(v) => setForm({ ...form, zip: v, latitude: null, longitude: null })} />
        </div>
        <button
          type="button"
          onClick={onPin}
          disabled={geocoding}
          className={cn(
            "flex h-11 w-full items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition disabled:opacity-60",
            hasPin ? "border-green-200 bg-green-50 text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-400" : "border-soft hover:bg-canvas",
          )}
        >
          {geocoding ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}
          {hasPin ? "Pinned on map · Re-pin" : "Pin on map"}
        </button>
      </section>
    </ViewShell>
  );
}

function AreaInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-brand/60">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-soft bg-canvas px-3.5 py-2.5 text-sm outline-none transition focus:border-accent/50 focus:ring-4 focus:ring-accent/10"
      />
    </label>
  );
}

/* ---------- Portfolio ---------- */

export function PortfolioView({ providerId, photos }: { providerId: string; photos: string[] }) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  // Photos save straight to provider_profiles.photo_urls — no separate save
  // step, so an upload can't be lost by forgetting to press a button.
  const persist = async (next: string[]) => {
    const { error } = await supabase.from("provider_profiles").update({ photo_urls: next }).eq("id", providerId);
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["provider-profile", providerId] });
    qc.invalidateQueries({ queryKey: ["provider", providerId] });
    qc.invalidateQueries({ queryKey: ["providers"] });
  };

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        urls.push(await uploadUserFile("provider-photos", providerId, file, "portfolio"));
      }
      if (urls.length) {
        await persist([...photos, ...urls]);
        toast.success(urls.length === 1 ? "Photo added" : `${urls.length} photos added`);
      }
    } catch (err: any) {
      toast.error(err.message ?? "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (url: string) => {
    setBusy(true);
    try {
      await persist(photos.filter((p) => p !== url));
      toast.success("Photo removed");
    } catch (err: any) {
      toast.error(err.message ?? "Couldn't remove photo");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ViewShell
      title="Portfolio"
      footer={
        <PrimaryAction onClick={() => inputRef.current?.click()} loading={busy}>
          <ImagePlus className="size-4" /> Add Photos
        </PrimaryAction>
      }
    >
      <p className="px-1 text-sm text-brand/60">Your first photo is used as your cover on your public profile. Max 5 MB each.</p>
      {photos.length === 0 ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={cn(card, "flex w-full flex-col items-center gap-2 border-dashed px-6 py-14 text-sm text-brand/55")}
        >
          <ImagePlus className="size-8 text-accent" /> Add photos of your work
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((url, i) => (
            <div key={url} className="group relative aspect-square overflow-hidden rounded-xl bg-canvas">
              <img src={url} alt={`Portfolio photo ${i + 1}`} className="h-full w-full object-cover" />
              {i === 0 && <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">Cover</span>}
              <button
                type="button"
                onClick={() => remove(url)}
                disabled={busy}
                aria-label={`Remove photo ${i + 1}`}
                className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-black/60 text-white transition hover:bg-red-600 disabled:opacity-50"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="grid aspect-square place-items-center rounded-xl border-2 border-dashed border-soft text-sm font-medium text-accent transition hover:bg-surface"
          >
            <span className="flex flex-col items-center gap-1">
              <ImagePlus className="size-6" /> Add
            </span>
          </button>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" aria-label="Upload portfolio photos" onChange={(e) => {
        add(e.target.files);
        e.target.value = "";
      }} />
    </ViewShell>
  );
}
