import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { notifyProviderOfBooking } from "@/lib/booking-notifications.functions";
import { ArrowLeft, Loader2, Calendar, Clock, MapPin } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/book/$id")({
  head: () => ({ meta: [{ title: "Book service — Nearby" }, { name: "robots", content: "noindex" }] }),
  component: BookPage,
});

function BookPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useSession();
  const notify = useServerFn(notifyProviderOfBooking);

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

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return navigate({ to: "/auth", search: { redirect: `/book/${id}` } });
    setLoading(true);
    try {
      const cat = categoryId || categories[0]?.id || null;
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
          total_price: hourlyRate ? hourlyRate * duration : null,
        })
        .select("id")
        .single();
      if (error) throw error;
      toast.success("Booking requested!");
      notify({ data: { bookingId: inserted.id } }).catch((err) =>
        console.warn("[booking] notify failed", err),
      );
      navigate({ to: "/bookings" });
    } catch (err: any) {
      toast.error(err.message ?? "Booking failed");
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) {
    return <div className="min-h-screen grid place-items-center"><Loader2 className="size-6 animate-spin text-brand/40" /></div>;
  }
  if (!provider) {
    return <div className="min-h-screen grid place-items-center text-sm text-brand/60">Provider not found.</div>;
  }

  const total = hourlyRate ? hourlyRate * duration : null;

  return (
    <div className="min-h-screen bg-canvas pb-32 lg:pl-72">
      <header className="sticky top-0 z-20 bg-surface border-b border-brand/5 px-4 pt-6 pb-4 flex items-center gap-3">
        <button
          onClick={() => navigate({ to: "/provider/$id", params: { id } })}
          className="size-10 rounded-full bg-brand/5 grid place-items-center"
        >
          <ArrowLeft className="size-4" />
        </button>
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wider text-brand/40">Book service</div>
          <h1 className="text-lg font-black truncate">{provider.business_name}</h1>
        </div>
      </header>

      <form onSubmit={submit} className="px-4 py-4 space-y-4 max-w-lg mx-auto">
        <div className="bg-surface p-4 rounded-2xl border border-brand/5 shadow-sm flex gap-3 items-center">
          <div className="size-14 rounded-xl bg-canvas overflow-hidden grid place-items-center text-brand/40 font-bold">
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
              <div className="font-mono font-bold text-accent">₦{hourlyRate.toFixed(0)}/hr</div>
            </div>
          )}
        </div>

        {categories.length > 0 && (
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-brand/40 block mb-1.5">Service</label>
            <select
              value={categoryId || categories[0]?.id}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full bg-surface border border-brand/5 rounded-xl py-3 px-3 text-sm outline-none focus:ring-2 focus:ring-accent/30"
            >
              {categories.map((c: any) => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-brand/40 block mb-1.5 flex items-center gap-1"><Calendar className="size-3" /> When</label>
          <input
            type="datetime-local"
            required
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="w-full bg-surface border border-brand/5 rounded-xl py-3 px-3 text-sm outline-none focus:ring-2 focus:ring-accent/30"
          />
        </div>

        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-brand/40 block mb-1.5 flex items-center gap-1"><Clock className="size-3" /> Duration (hours)</label>
          <input
            type="number"
            min={0.5}
            step={0.5}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="w-full bg-surface border border-brand/5 rounded-xl py-3 px-3 text-sm outline-none focus:ring-2 focus:ring-accent/30"
          />
        </div>

        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-brand/40 block mb-1.5 flex items-center gap-1"><MapPin className="size-3" /> Service address</label>
          <input
            required
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Where should the pro come?"
            className="w-full bg-surface border border-brand/5 rounded-xl py-3 px-3 text-sm outline-none focus:ring-2 focus:ring-accent/30"
          />
        </div>

        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-brand/40 block mb-1.5">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Anything the pro should know?"
            className="w-full bg-surface border border-brand/5 rounded-xl py-3 px-3 text-sm outline-none resize-none focus:ring-2 focus:ring-accent/30"
          />
        </div>

        {total != null && (
          <div className="bg-surface p-4 rounded-2xl border border-brand/5 flex items-center justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase text-brand/40">Estimated total</div>
              <div className="text-xs text-brand/60">{duration}h × ₦{hourlyRate!.toFixed(0)}</div>
            </div>
            <div className="font-mono font-black text-xl text-accent">₦{total.toFixed(0)}</div>
          </div>
        )}
      </form>

      <div className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-border p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        <div className="max-w-lg mx-auto flex gap-2">
          <button
            type="button"
            onClick={() => navigate({ to: "/provider/$id", params: { id } })}
            className="px-5 h-12 rounded-xl border border-brand/10 text-sm font-bold"
          >
            Back
          </button>
          <button
            onClick={submit}
            disabled={loading || !scheduledAt || !address}
            className="flex-1 h-12 bg-accent text-white rounded-xl text-sm font-bold shadow-lg shadow-accent/20 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="size-4 animate-spin" />}
            Confirm booking{total != null ? ` — ₦${total.toFixed(0)}` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
