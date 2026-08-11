import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { notifyProviderOfBooking } from "@/lib/booking-notifications.functions";
import { initializePaystackPayment } from "@/lib/payments.functions";
import { ArrowLeft, Calendar, Clock, MapPin } from "lucide-react";
import { toast } from "sonner";
import { buildBookingPaymentData, getBookingPaymentSettings } from "@/lib/booking-payment";
import { formatMoney, useCurrency } from "@/lib/currency";
import { PageSpinner, PrimaryButton, SecondaryButton } from "@/components/ui-kit";

export const Route = createFileRoute("/_authenticated/book/$id")({
  head: () => ({ meta: [{ title: "Book service — Fixrly" }, { name: "robots", content: "noindex" }] }),
  component: BookPage,
});

const fieldClass = "w-full bg-surface border border-brand/5 rounded-2xl py-3 px-3 text-sm outline-none transition focus:ring-2 focus:ring-accent/30 focus:border-accent/30";
const labelClass = "text-[10px] font-bold uppercase tracking-widest text-brand/40 block mb-1.5 flex items-center gap-1";

function BookPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useSession();
  const notify = useServerFn(notifyProviderOfBooking);
  const initializePayment = useServerFn(initializePaystackPayment);
  const currency = useCurrency();

  const { data: provider, isLoading } = useQuery({
    queryKey: ["book-provider", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("provider_profiles")
        .select("id,business_name,hourly_rate,city,photo_urls,provider_categories(service_categories(id,name,icon))")
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

  const [categoryId, setCategoryId] = useState<string>("");
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
      const cat = categoryId || categories[0]?.id || null;
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
          ...paymentPayload,
        })
        .select("id")
        .single();
      if (error) throw error;
      notify({ data: { bookingId: inserted.id } }).catch((err) =>
        console.warn("[booking] notify failed", err),
      );

      if (settings.payment_enabled && settings.provider === "paystack") {
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

  return (
    <div className="min-h-screen bg-canvas pb-32">
      <header className="sticky top-0 z-20 bg-surface/95 backdrop-blur border-b border-soft px-4 pt-6 pb-4">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <button
            onClick={() => navigate({ to: "/provider/$id", params: { id } })}
            className="size-10 rounded-full bg-brand/5 grid place-items-center transition hover:bg-brand/10"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-brand/40">Book service</div>
            <h1 className="text-lg font-black truncate">{provider.business_name}</h1>
          </div>
        </div>
      </header>

      <form onSubmit={submit} className="px-4 py-4 space-y-4 max-w-lg mx-auto">
        <div className="light-surface bg-white/95 p-4 rounded-3xl border border-soft shadow-soft flex gap-3 items-center">
          <div className="size-14 rounded-2xl bg-canvas overflow-hidden grid place-items-center text-brand/40 font-bold">
            {provider.photo_urls?.[0] ? (
              <img src={provider.photo_urls[0]} alt={provider.business_name} className="w-full h-full object-cover" />
            ) : (
              provider.business_name?.[0]
            )}
          </div>
          <div className="min-w-0">
            <div className="font-bold truncate">{provider.business_name}</div>
            {provider.city && <div className="text-xs text-brand/60">{provider.city}</div>}
          </div>
          {hourlyRate && (
            <div className="ml-auto text-right">
              <div className="text-[10px] font-bold uppercase text-brand/40">Rate</div>
              <div className="font-mono font-bold text-accent">{formatMoney(hourlyRate, currency)}/hr</div>
            </div>
          )}
        </div>

        {categories.length > 0 && (
          <div>
            <label className={labelClass}>Service</label>
            <select
              value={categoryId || categories[0]?.id}
              onChange={(e) => setCategoryId(e.target.value)}
              className={fieldClass}
            >
              {categories.map((c: any) => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className={labelClass}><Calendar className="size-3" /> When</label>
          <input
            type="datetime-local"
            required
            min={minScheduledAt}
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className={fieldClass}
          />
        </div>

        <div>
          <label className={labelClass}><Clock className="size-3" /> Duration (hours)</label>
          <input
            type="number"
            min={0.5}
            step={0.5}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className={fieldClass}
          />
        </div>

        <div>
          <label className={labelClass}><MapPin className="size-3" /> Service address</label>
          <input
            required
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Where should the pro come?"
            className={fieldClass}
          />
        </div>

        <div>
          <label className={labelClass}>Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Anything the pro should know?"
            className={`${fieldClass} resize-none`}
          />
        </div>

        {total != null && (
          <div className="light-surface bg-white/95 p-4 rounded-3xl border border-soft shadow-soft space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase text-brand/40">Estimated total</div>
                <div className="text-xs text-brand/60">{duration}h × {formatMoney(hourlyRate, currency)}</div>
              </div>
              <div className="font-mono font-black text-xl text-accent">{formatMoney(total, currency)}</div>
            </div>
            <div className="text-xs text-brand/60">
              Payments are handled by admin settings. If payments are enabled, your booking will be marked as pending payment until the admin confirms it.
            </div>
          </div>
        )}
      </form>

      <div className="light-surface fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-border p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        <div className="max-w-lg mx-auto flex gap-2">
          <SecondaryButton type="button" onClick={() => navigate({ to: "/provider/$id", params: { id } })} className="px-5 h-12 rounded-xl">
            Back
          </SecondaryButton>
          <PrimaryButton
            onClick={submit}
            loading={loading}
            disabled={!scheduledAt || !address}
            className="flex-1 h-12 rounded-xl"
          >
            Confirm booking{total != null ? ` — ${formatMoney(total, currency)}` : ""}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
