import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { initializePaystackPayment } from "@/lib/payments.functions";
import { geocodeLocation } from "@/lib/geocode.functions";
import { ArrowLeft, BadgeCheck, CalendarDays, CalendarCheck, Clock, MapPin, Minus, Plus, NotebookPen, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { buildBookingPaymentData, getBookingPaymentSettings } from "@/lib/booking-payment";
import { formatMoney, useCurrency } from "@/lib/currency";
import { CategoryIcon } from "@/components/CategoryVisual";
import { PageSpinner } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/book/$id")({
  // `service` preselects a category — set when the user taps a specific
  // service card on the provider's profile.
  validateSearch: (search: Record<string, unknown>): { service?: string } => ({
    service: typeof search.service === "string" ? search.service : undefined,
  }),
  head: () => ({ meta: [{ title: "Book service — Fixrly" }, { name: "robots", content: "noindex" }] }),
  component: BookPage,
});

const card = "rounded-2xl border border-soft bg-surface p-4 shadow-[0_8px_30px_rgba(15,23,42,0.06)] sm:p-5";
const fieldWrapClass =
  "flex items-center gap-3 rounded-xl border border-soft bg-canvas px-3.5 py-3 transition focus-within:border-accent/50 focus-within:ring-4 focus-within:ring-accent/10";
const fieldClass = "w-full min-w-0 bg-transparent text-sm outline-none";

function SectionTitle({ icon: Icon, children }: { icon: typeof Clock; children: React.ReactNode }) {
  return (
    <h2 className="mb-3 flex items-center gap-2.5 text-base font-bold">
      <span className="grid size-8 place-items-center rounded-full bg-orange-50 text-accent dark:bg-orange-500/10">
        <Icon className="size-4" />
      </span>
      {children}
    </h2>
  );
}

function BookPage() {
  const { id } = Route.useParams();
  const { service } = Route.useSearch();
  const navigate = useNavigate();
  const { user } = useSession();
  const initializePayment = useServerFn(initializePaystackPayment);
  const geocode = useServerFn(geocodeLocation);
  const currency = useCurrency();

  const { data: provider, isLoading } = useQuery({
    queryKey: ["book-provider", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("provider_profiles")
        .select("id,business_name,hourly_rate,city,photo_urls,provider_categories(service_categories(id,name,icon,slug))")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const categories = (provider?.provider_categories ?? [])
    .map((pc: any) => pc.service_categories)
    .filter(Boolean);
  const hourlyRate = provider?.hourly_rate ? Number(provider.hourly_rate) : null;

  const [categoryId, setCategoryId] = useState<string>(service ?? "");
  const [scheduledAt, setScheduledAt] = useState<string>("");
  const [duration, setDuration] = useState<number>(1);
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const minScheduledAt = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return navigate({ to: "/auth", search: { redirect: `/book/${id}` } });
    if (new Date(scheduledAt).getTime() < Date.now()) {
      return toast.error("Pick a date and time in the future");
    }
    setLoading(true);
    try {
      const cat = (categories.some((c: any) => c.id === categoryId) ? categoryId : categories[0]?.id) || null;
      const total = hourlyRate ? hourlyRate * duration : null;
      // A hiccup reading payment settings shouldn't block the booking itself —
      // fall back to "no payment" so the request still goes through.
      const settings = await getBookingPaymentSettings().catch(() => ({
        provider: "none",
        mode: "sandbox",
        currency: "NGN",
        payment_enabled: false,
        publishable_key: null,
        platform_fee_percent: 0,
      }));
      const paymentPayload = buildBookingPaymentData(total, settings);
      // Best-effort: geocode the service address so the "on the way" map has
      // a destination pin. A geocode hiccup shouldn't block the booking.
      const destination = await geocode({ data: { query: address } }).catch(() => null);
      const { data: inserted, error } = await supabase
        .from("bookings")
        .insert({
          customer_id: user.id,
          provider_id: id,
          category_id: cat,
          scheduled_at: new Date(scheduledAt).toISOString(),
          duration_hours: duration,
          address,
          notes: notes || null,
          total_price: total,
          dest_lat: destination?.found ? destination.lat : null,
          dest_lng: destination?.found ? destination.lng : null,
          ...paymentPayload,
        })
        .select("id")
        .single();
      if (error) throw error;
      // Provider gets notified (in-app + push + email) via the
      // booking_created row the notify_provider_on_new_booking Postgres
      // trigger inserts on this same INSERT — no client call needed.

      if (settings.payment_enabled && settings.provider === "paystack" && total != null && total > 0) {
        try {
          const { authorizationUrl } = await initializePayment({ data: { bookingId: inserted.id } });
          toast.success("Booking requested — redirecting to checkout…");
          window.location.href = authorizationUrl;
          return;
        } catch (payErr: any) {
          toast.error(payErr.message ?? "Couldn't start checkout — you can pay from My Bookings");
          navigate({ to: "/bookings" });
          return;
        }
      }

      toast.success("Booking requested!");
      navigate({ to: "/bookings" });
    } catch (err: any) {
      toast.error(err.message ?? "Booking failed");
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) {
    return <PageSpinner />;
  }
  if (!provider) {
    return <div className="min-h-screen grid place-items-center text-sm text-brand/60">Provider not found.</div>;
  }

  const total = hourlyRate ? hourlyRate * duration : null;
  // An unknown ?service= id (e.g. a category the provider has since
  // dropped) falls back to their first service rather than selecting nothing.
  const selectedCategoryId = categories.some((c: any) => c.id === categoryId) ? categoryId : categories[0]?.id;
  const selectedCategory = categories.find((c: any) => c.id === selectedCategoryId);
  const changeDuration = (delta: number) => setDuration((d) => Math.min(24, Math.max(0.5, d + delta)));

  return (
    <div className="min-h-screen bg-canvas pb-28 text-brand">
      <header className="relative overflow-hidden bg-[#0b1730] text-white">
        {provider.photo_urls?.[0] && (
          <img src={provider.photo_urls[0]} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-[#0b1730] via-[#0b1730]/90 to-[#0b1730]/50" />
        <div className="relative mx-auto max-w-2xl px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate({ to: "/provider/$id", params: { id } })}
              aria-label="Back"
              className="grid size-11 place-items-center rounded-full border border-white/20 bg-black/25 backdrop-blur-md transition hover:bg-black/40"
            >
              <ArrowLeft className="size-5" />
            </button>
            <h1 className="text-xl font-extrabold tracking-tight">Book a Service</h1>
          </div>
          <div className="mt-5 flex items-center gap-3.5">
            <div className="relative shrink-0">
              <div className="grid size-16 place-items-center overflow-hidden rounded-full border-[3px] border-white bg-white/10 text-xl font-bold">
                {provider.photo_urls?.[0] ? (
                  <img src={provider.photo_urls[0]} alt="" onError={(e) => (e.currentTarget.style.display = "none")} className="h-full w-full object-cover" />
                ) : (
                  provider.business_name?.[0]
                )}
              </div>
              <BadgeCheck className="absolute -bottom-0.5 -right-0.5 size-6 fill-blue-500 text-white" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-lg font-bold">{provider.business_name}</div>
              {provider.city && (
                <div className="mt-0.5 flex items-center gap-1.5 text-sm text-white/80">
                  <MapPin className="size-3.5" /> {provider.city}
                </div>
              )}
            </div>
            {hourlyRate && (
              <div className="shrink-0 rounded-xl bg-white/10 px-3 py-2 text-right ring-1 ring-white/15">
                <div className="text-base font-bold">{formatMoney(hourlyRate, currency)}</div>
                <div className="text-[11px] text-white/70">per hour</div>
              </div>
            )}
          </div>
        </div>
      </header>

      <form onSubmit={submit} className="mx-auto max-w-2xl space-y-4 px-4 pt-4">
        {categories.length > 0 && (
          <section className={card} aria-labelledby="choose-service">
            <h2 id="choose-service" className="mb-3 text-base font-bold">Choose a service</h2>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3" role="radiogroup" aria-label="Service">
              {categories.map((c: any) => {
                const active = c.id === selectedCategoryId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setCategoryId(c.id)}
                    className={cn(
                      "relative flex items-center gap-2.5 rounded-xl border p-3 text-left transition",
                      active ? "border-accent bg-orange-50/70 ring-2 ring-accent/15 dark:bg-orange-500/10" : "border-soft bg-surface hover:border-accent/30",
                    )}
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-orange-50 dark:bg-orange-500/10">
                      <CategoryIcon slug={c.slug} emoji={c.icon} className="size-[18px] text-lg" />
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-semibold leading-snug">{c.name}</span>
                    {active && (
                      <span className="absolute right-2 top-2 grid size-4 place-items-center rounded-full bg-accent text-white">
                        <Check className="size-3" strokeWidth={3} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <section className={card}>
          <SectionTitle icon={CalendarDays}>When do you need it?</SectionTitle>
          <label className={fieldWrapClass}>
            <span className="sr-only">Date and time</span>
            <input
              type="datetime-local"
              required
              min={minScheduledAt}
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className={fieldClass}
            />
          </label>

          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-full bg-orange-50 text-accent dark:bg-orange-500/10">
                <Clock className="size-4" />
              </span>
              <div>
                <div className="text-sm font-semibold">Duration</div>
                <div className="text-xs text-brand/55">In hours</div>
              </div>
            </div>
            <div className="flex items-center gap-1 rounded-full border border-soft bg-canvas p-1">
              <button
                type="button"
                onClick={() => changeDuration(-0.5)}
                disabled={duration <= 0.5}
                aria-label="Decrease duration"
                className="grid size-9 place-items-center rounded-full bg-surface shadow-sm transition hover:bg-orange-50 disabled:opacity-40"
              >
                <Minus className="size-4" />
              </button>
              <span className="w-16 text-center text-sm font-bold" aria-live="polite">
                {duration} {duration === 1 ? "hr" : "hrs"}
              </span>
              <button
                type="button"
                onClick={() => changeDuration(0.5)}
                disabled={duration >= 24}
                aria-label="Increase duration"
                className="grid size-9 place-items-center rounded-full bg-surface shadow-sm transition hover:bg-orange-50 disabled:opacity-40"
              >
                <Plus className="size-4" />
              </button>
            </div>
          </div>
        </section>

        <section className={card}>
          <SectionTitle icon={MapPin}>Where should the pro come?</SectionTitle>
          <label className={fieldWrapClass}>
            <span className="sr-only">Service address</span>
            <input
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Street, area, city"
              className={fieldClass}
            />
          </label>
        </section>

        <section className={card}>
          <SectionTitle icon={NotebookPen}>
            Notes <span className="text-xs font-normal text-brand/50">(optional)</span>
          </SectionTitle>
          <label className={cn(fieldWrapClass, "items-start")}>
            <span className="sr-only">Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Anything the pro should know?"
              className={cn(fieldClass, "resize-none")}
            />
          </label>
        </section>

        <section className={card} aria-labelledby="summary">
          <h2 id="summary" className="text-base font-bold">Booking summary</h2>
          <dl className="mt-3 space-y-2.5 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-brand/60">Service</dt>
              <dd className="text-right font-medium">{selectedCategory?.name ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-brand/60">When</dt>
              <dd className="text-right font-medium">
                {scheduledAt
                  ? new Date(scheduledAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
                  : "Not set"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-brand/60">Rate</dt>
              <dd className="text-right font-medium">
                {hourlyRate ? `${formatMoney(hourlyRate, currency)} × ${duration}h` : "Price on request"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-soft pt-3">
              <dt className="font-semibold">Estimated total</dt>
              <dd className="text-xl font-extrabold text-accent">{total != null ? formatMoney(total, currency) : "—"}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-brand/55">
            If online payment is enabled, you'll be taken to checkout after confirming. Otherwise, settle with the provider directly.
          </p>
        </section>
      </form>

      <div className="light-surface fixed inset-x-0 bottom-0 z-40 border-t border-soft bg-white/95 p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center gap-2.5">
          <button
            type="button"
            onClick={() => navigate({ to: "/provider/$id", params: { id } })}
            className="h-12 rounded-full bg-blue-50 px-6 text-sm font-semibold text-[#0b1730] transition hover:bg-blue-100"
          >
            Back
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={loading || !scheduledAt || !address}
            className="flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-accent to-orange-500 px-4 text-sm font-semibold text-white shadow-lg shadow-accent/30 transition hover:brightness-105 disabled:opacity-50 disabled:shadow-none"
          >
            {loading ? <Loader2 className="size-5 animate-spin" /> : <CalendarCheck className="size-5 shrink-0" />}
            <span className="truncate">Confirm booking{total != null ? ` · ${formatMoney(total, currency)}` : ""}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
