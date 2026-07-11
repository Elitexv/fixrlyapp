import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { GoogleMap } from "@/components/GoogleMap";
import { BottomNav } from "@/components/BottomNav";
import { ArrowLeft, Star, MapPin, Loader2, Phone, Mail } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/provider/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `Provider profile — Nearby` },
      { name: "description", content: `Book this service provider on Nearby.` },
    ],
  }),
  component: ProviderPage,
});

function ProviderPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useSession();

  const { data, isLoading } = useQuery({
    queryKey: ["provider", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("provider_profiles")
        .select("*, profiles!provider_profiles_id_fkey(full_name,avatar_url,phone), provider_categories(service_categories(id,name,icon))")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: reviews = [] } = useQuery({
    queryKey: ["reviews", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reviews")
        .select("id,rating,comment,created_at,customer_id,profiles!reviews_customer_id_fkey(full_name)")
        .eq("provider_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const [showBook, setShowBook] = useState(false);

  if (isLoading) {
    return <div className="min-h-screen grid place-items-center"><Loader2 className="size-6 animate-spin text-brand/40" /></div>;
  }
  if (!data) {
    return <div className="min-h-screen grid place-items-center text-sm text-brand/60">Provider not found.</div>;
  }

  const rating = reviews.length ? reviews.reduce((a, b) => a + b.rating, 0) / reviews.length : null;
  const categories = (data.provider_categories ?? []).map((pc: any) => pc.service_categories).filter(Boolean);

  return (
    <div className="min-h-screen bg-canvas pb-32">
      <div className="relative h-56 bg-brand/10">
        {data.photo_urls?.[0] ? (
          <img src={data.photo_urls[0]} alt={data.business_name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full grid place-items-center text-brand/30 font-black text-6xl">
            {data.business_name?.[0]}
          </div>
        )}
        <button
          onClick={() => history.back()}
          className="absolute top-4 left-4 size-10 rounded-full bg-white/90 backdrop-blur grid place-items-center shadow-lg"
        >
          <ArrowLeft className="size-4" />
        </button>
      </div>

      <div className="px-4 -mt-6 relative">
        <div className="bg-surface p-4 rounded-2xl shadow-sm border border-brand/5">
          <div className="flex justify-between items-start gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-black tracking-tight truncate">{data.business_name}</h1>
              {data.city && <div className="text-xs text-brand/60 flex items-center gap-1 mt-0.5"><MapPin className="size-3" />{data.city}</div>}
            </div>
            <div className="flex items-center gap-1 bg-brand/5 px-2.5 py-1 rounded-lg text-xs font-bold shrink-0">
              <Star className="size-3.5 fill-yellow-500 text-yellow-500" />
              {rating ? rating.toFixed(1) : "New"}
              <span className="text-brand/40">({reviews.length})</span>
            </div>
          </div>

          <div className="flex gap-2 mt-3 flex-wrap">
            {categories.map((c: any) => (
              <span key={c.id} className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-brand/5">
                {c.icon} {c.name}
              </span>
            ))}
          </div>

          {data.hourly_rate != null && (
            <div className="mt-4 pt-4 border-t border-brand/5 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase text-brand/40">Rate</div>
                <div className="font-mono font-bold text-lg text-accent">${Number(data.hourly_rate).toFixed(0)}<span className="text-xs text-brand/60">/hr</span></div>
              </div>
              {data.availability_note && (
                <div className="text-right">
                  <div className="text-[10px] font-bold uppercase text-brand/40">Availability</div>
                  <div className="text-xs font-semibold text-green-600">{data.availability_note}</div>
                </div>
              )}
            </div>
          )}
        </div>

        {data.bio && (
          <div className="mt-4 bg-surface p-4 rounded-2xl border border-brand/5 shadow-sm">
            <div className="text-[10px] font-bold uppercase tracking-widest text-brand/40 mb-1">About</div>
            <p className="text-sm leading-relaxed">{data.bio}</p>
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
          {data.phone && (
            <a href={`tel:${data.phone}`} className="bg-surface p-3 rounded-xl border border-brand/5 flex items-center gap-2 font-semibold">
              <Phone className="size-4 text-accent" /> Call
            </a>
          )}
          {(data.profiles as any)?.full_name && (
            <div className="bg-surface p-3 rounded-xl border border-brand/5 flex items-center gap-2 font-semibold truncate">
              <Mail className="size-4 text-accent" /> {(data.profiles as any).full_name}
            </div>
          )}
        </div>

        {data.latitude && data.longitude && (
          <div className="mt-4 h-40 rounded-2xl overflow-hidden border border-brand/10 shadow-sm">
            <GoogleMap
              center={{ lat: data.latitude, lng: data.longitude }}
              markers={[{ lat: data.latitude, lng: data.longitude, id: data.id }]}
              zoom={13}
            />
          </div>
        )}

        <div className="mt-6">
          <h2 className="font-bold text-lg mb-3">Reviews</h2>
          {reviews.length === 0 ? (
            <p className="text-sm text-brand/50">No reviews yet.</p>
          ) : (
            <div className="space-y-3">
              {reviews.map((r) => (
                <div key={r.id} className="bg-surface p-4 rounded-2xl border border-brand/5">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">{r.profiles?.full_name ?? "Customer"}</div>
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className={`size-3 ${i < r.rating ? "fill-yellow-500 text-yellow-500" : "text-brand/20"}`} />
                      ))}
                    </div>
                  </div>
                  {r.comment && <p className="text-sm mt-1 text-brand/80">{r.comment}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-border p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        <div className="max-w-lg mx-auto">
          <button
            onClick={() => {
              if (!user) return navigate({ to: "/auth", search: { redirect: `/provider/${id}` } });
              setShowBook(true);
            }}
            className="w-full py-3.5 bg-accent text-white rounded-xl text-sm font-bold shadow-lg shadow-accent/20"
          >
            Book this pro
          </button>
        </div>
      </div>

      {showBook && (
        <BookingModal
          providerId={id}
          categories={categories}
          hourlyRate={data.hourly_rate ? Number(data.hourly_rate) : null}
          onClose={() => setShowBook(false)}
        />
      )}
    </div>
  );
}

function BookingModal({
  providerId,
  categories,
  hourlyRate,
  onClose,
}: {
  providerId: string;
  categories: any[];
  hourlyRate: number | null;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [categoryId, setCategoryId] = useState<string>(categories[0]?.id ?? "");
  const [scheduledAt, setScheduledAt] = useState<string>("");
  const [duration, setDuration] = useState<number>(1);
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sign in required");
      const { error } = await supabase.from("bookings").insert({
        customer_id: u.user.id,
        provider_id: providerId,
        category_id: categoryId || null,
        scheduled_at: new Date(scheduledAt).toISOString(),
        duration_hours: duration,
        address,
        notes: notes || null,
        total_price: hourlyRate ? hourlyRate * duration : null,
      });
      if (error) throw error;
      toast.success("Booking requested!");
      onClose();
      navigate({ to: "/bookings" });
    } catch (err: any) {
      toast.error(err.message ?? "Booking failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-end sm:place-items-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-md bg-surface rounded-t-3xl sm:rounded-3xl p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-black">Request a booking</h3>
        <p className="text-xs text-brand/60 mt-0.5">The provider will confirm availability.</p>
        <form onSubmit={submit} className="space-y-3 mt-4">
          {categories.length > 0 && (
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-full bg-canvas rounded-xl py-2.5 px-3 text-sm outline-none">
              {categories.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
          <input type="datetime-local" required value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="w-full bg-canvas rounded-xl py-2.5 px-3 text-sm outline-none" />
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold uppercase text-brand/40">Duration</label>
            <input type="number" min={0.5} step={0.5} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="w-24 bg-canvas rounded-xl py-2 px-3 text-sm outline-none" />
            <span className="text-xs text-brand/60">hours</span>
            {hourlyRate && <span className="ml-auto text-sm font-bold text-accent">${(hourlyRate * duration).toFixed(2)}</span>}
          </div>
          <input required value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Service address" className="w-full bg-canvas rounded-xl py-2.5 px-3 text-sm outline-none" />
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" rows={3} className="w-full bg-canvas rounded-xl py-2.5 px-3 text-sm outline-none resize-none" />
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-3 rounded-xl border border-brand/10 text-sm font-bold">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 py-3 bg-accent text-white rounded-xl text-sm font-bold shadow-lg shadow-accent/20 disabled:opacity-60 flex items-center justify-center gap-2">
              {loading && <Loader2 className="size-4 animate-spin" />}
              Request
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
