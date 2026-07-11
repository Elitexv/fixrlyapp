import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession, useRoles } from "@/lib/session";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BottomNav } from "@/components/BottomNav";
import { geocodeLocation } from "@/lib/geocode.functions";
import { toast } from "sonner";
import { Loader2, MapPin } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Provider dashboard — Nearby" }, { name: "robots", content: "noindex" }] }),
  component: DashboardPage,
});

const statusStyles: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  accepted: "bg-blue-100 text-blue-800",
  rejected: "bg-red-100 text-red-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-gray-100 text-gray-700",
};

function DashboardPage() {
  const { user } = useSession();
  const { data: roles = [] } = useRoles(user);
  const isProvider = roles.includes("provider");
  const isAdmin = roles.includes("admin");
  const qc = useQueryClient();
  const geocode = useServerFn(geocodeLocation);

  const { data: profile } = useQuery({
    queryKey: ["provider-profile", user?.id],
    enabled: !!user && isProvider,
    queryFn: async () => {
      const { data, error } = await supabase.from("provider_profiles").select("*").eq("id", user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data } = await supabase.from("service_categories").select("id,name,icon").order("sort_order");
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
        .select("*, customer:profiles!bookings_customer_id_fkey(full_name), category:service_categories(name,icon)")
        .eq("provider_id", user!.id)
        .order("scheduled_at", { ascending: false });
      return data ?? [];
    },
  });

  const updateStatus = async (id: string, status: "accepted" | "rejected" | "completed") => {
    const { error } = await supabase.from("bookings").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Booking ${status}`);
    qc.invalidateQueries({ queryKey: ["provider-bookings", user!.id] });
  };

  const stats = useMemo(() => {
    const earned = bookings.filter((b: any) => b.status === "completed").reduce((s: number, b: any) => s + (Number(b.total_price) || 0), 0);
    return {
      pending: bookings.filter((b: any) => b.status === "pending").length,
      accepted: bookings.filter((b: any) => b.status === "accepted").length,
      completed: bookings.filter((b: any) => b.status === "completed").length,
      earned,
    };
  }, [bookings]);

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

  if (!isProvider) {
    return (
      <div className="min-h-screen bg-canvas grid place-items-center px-6 pb-24">
        <div className="text-center max-w-sm">
          <h1 className="text-xl font-black">You're not a provider yet</h1>
          <p className="text-sm text-brand/60 mt-2">Enable provider mode from your profile to list services.</p>
          <Link to="/profile" className="inline-block mt-4 px-5 py-2.5 bg-accent text-white rounded-xl text-sm font-bold">Go to profile</Link>
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

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
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
        latitude: form.latitude,
        longitude: form.longitude,
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

  return (
    <div className="min-h-screen bg-canvas pb-32">
      <header className="bg-surface border-b border-brand/5 px-4 pt-6 pb-4">
        <h1 className="text-xl font-black">Provider dashboard</h1>
        <p className="text-xs text-brand/60 mt-1">Manage your listing, availability, and earnings.</p>
      </header>

      <div className="px-4 py-4 grid grid-cols-2 gap-3">
        <Stat label="Pending" value={stats.pending} />
        <Stat label="Accepted" value={stats.accepted} />
        <Stat label="Completed" value={stats.completed} />
        <Stat label="Earnings" value={`$${stats.earned.toFixed(0)}`} accent />
      </div>

      {isAdmin && (
        <div className="px-4 mb-2">
          <Link to="/admin" className="block bg-brand text-white p-3 rounded-xl text-sm font-bold text-center">Admin dashboard →</Link>
        </div>
      )}

      <section className="px-4 mb-2">
        <div className="bg-surface p-4 rounded-2xl border border-brand/5 shadow-sm">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-bold">Orders</h2>
            <Link to="/bookings" className="text-[10px] font-bold uppercase tracking-wider text-accent">View all →</Link>
          </div>
          {bookings.length === 0 ? (
            <p className="text-xs text-brand/50 py-6 text-center">No orders yet. Once customers book you, they'll appear here.</p>
          ) : (
            <div className="space-y-2">
              {bookings.slice(0, 6).map((b: any) => (
                <div key={b.id} className="p-3 bg-canvas rounded-xl">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold uppercase text-brand/40">
                        {b.category?.icon} {b.category?.name}
                      </div>
                      <div className="font-bold text-sm truncate">{b.customer?.full_name ?? "Customer"}</div>
                      <div className="text-[11px] text-brand/60 mt-0.5">
                        {new Date(b.scheduled_at).toLocaleString()} • {b.duration_hours}h
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${statusStyles[b.status] ?? ""}`}>{b.status}</span>
                      {b.total_price && <span className="font-mono font-bold text-xs text-accent">${Number(b.total_price).toFixed(0)}</span>}
                    </div>
                  </div>
                  {(b.status === "pending" || b.status === "accepted") && (
                    <div className="flex gap-2 mt-2">
                      {b.status === "pending" && (
                        <>
                          <button onClick={() => updateStatus(b.id, "accepted")} className="flex-1 py-1.5 bg-accent text-white rounded-lg text-[11px] font-bold">Accept</button>
                          <button onClick={() => updateStatus(b.id, "rejected")} className="flex-1 py-1.5 border border-brand/10 rounded-lg text-[11px] font-bold">Reject</button>
                        </>
                      )}
                      {b.status === "accepted" && (
                        <button onClick={() => updateStatus(b.id, "completed")} className="flex-1 py-1.5 bg-brand text-white rounded-lg text-[11px] font-bold">Mark completed</button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>


      <form onSubmit={save} className="px-4 pb-6 space-y-3">
        <section className="bg-surface p-4 rounded-2xl border border-brand/5 shadow-sm space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="font-bold">Listing</h2>
            <label className="flex items-center gap-2 text-xs font-bold">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Active
            </label>
          </div>
          <Field label="Business name" required value={form.business_name} onChange={(v) => setForm({ ...form, business_name: v })} />
          <Field label="Bio" textarea value={form.bio} onChange={(v) => setForm({ ...form, bio: v })} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Hourly rate ($)" value={form.hourly_rate} type="number" onChange={(v) => setForm({ ...form, hourly_rate: v })} />
            <Field label="Service radius (km)" value={String(form.service_radius_km)} type="number" onChange={(v) => setForm({ ...form, service_radius_km: Number(v) || 0 })} />
          </div>
          <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
          <Field label="Availability note" value={form.availability_note} onChange={(v) => setForm({ ...form, availability_note: v })} placeholder="e.g. Available today, 2pm" />
        </section>

        <section className="bg-surface p-4 rounded-2xl border border-brand/5 shadow-sm space-y-3">
          <h2 className="font-bold">Service area</h2>
          <Field label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="City" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
            <Field label="ZIP" value={form.zip} onChange={(v) => setForm({ ...form, zip: v })} />
          </div>
          <button type="button" onClick={geocodeAddress} disabled={geocoding} className="w-full py-2.5 border border-brand/10 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-60">
            {geocoding ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}
            {form.latitude ? `Pinned (${form.latitude.toFixed(3)}, ${form.longitude!.toFixed(3)})` : "Pin on map"}
          </button>
        </section>

        <section className="bg-surface p-4 rounded-2xl border border-brand/5 shadow-sm">
          <h2 className="font-bold mb-3">Categories</h2>
          <div className="flex flex-wrap gap-2">
            {categories.map((c: any) => {
              const on = selectedCats.includes(c.id);
              return (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => setSelectedCats(on ? selectedCats.filter((x) => x !== c.id) : [...selectedCats, c.id])}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold ${on ? "bg-brand text-white" : "bg-canvas border border-brand/10"}`}
                >
                  {c.icon} {c.name}
                </button>
              );
            })}
          </div>
        </section>

        <button disabled={saving} className="w-full py-3.5 bg-accent text-white rounded-xl text-sm font-bold shadow-lg shadow-accent/20 disabled:opacity-60 flex items-center justify-center gap-2">
          {saving && <Loader2 className="size-4 animate-spin" />}
          Save listing
        </button>
      </form>

      <BottomNav />
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className={`p-4 rounded-2xl ${accent ? "bg-brand text-white" : "bg-surface border border-brand/5"}`}>
      <div className={`text-[10px] font-bold uppercase tracking-wider ${accent ? "text-white/60" : "text-brand/40"}`}>{label}</div>
      <div className={`font-mono font-black text-2xl ${accent ? "text-accent-orange" : ""}`} style={accent ? { color: "#ff5a1f" } : undefined}>{value}</div>
    </div>
  );
}

function Field({
  label, value, onChange, type = "text", required, textarea, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; textarea?: boolean; placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase text-brand/40">{label}{required && " *"}</span>
      {textarea ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} placeholder={placeholder} required={required} className="mt-1 w-full bg-canvas rounded-xl py-2.5 px-3 text-sm outline-none resize-none" />
      ) : (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} required={required} className="mt-1 w-full bg-canvas rounded-xl py-2.5 px-3 text-sm outline-none" />
      )}
    </label>
  );
}
