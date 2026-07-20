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
    <div className="min-h-screen bg-canvas pb-32 lg:pl-72">
      <header className="relative overflow-hidden bg-gradient-to-br from-accent/15 via-brand/10 to-surface px-5 pt-8 pb-12">
        <div className="pointer-events-none absolute -right-16 top-8 h-44 w-44 rounded-full bg-accent/20 blur-3xl" />
        <div className="pointer-events-none absolute left-6 top-10 h-28 w-28 rounded-full bg-brand/10 blur-3xl" />
        <div className="max-w-6xl mx-auto">
          <p className="text-sm uppercase tracking-[0.28em] text-accent/70">Dashboard</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight">Provider dashboard</h1>
          <p className="mt-3 max-w-3xl text-sm text-brand/60">Manage your listing, availability, bookings, and earnings with clear status cards and quick actions.</p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 -mt-10 space-y-4">
        <div className="grid gap-4 xl:grid-cols-[1.3fr_0.9fr]">
          <section className="rounded-[2rem] bg-white/95 border border-soft p-6 shadow-soft">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-sm uppercase tracking-[0.28em] text-brand/50">Live status</div>
                <h2 className="mt-2 text-2xl font-black">{profile?.business_name ?? "Your provider listing"}</h2>
                <p className="mt-2 text-sm text-brand/60">
                  {profile?.bio ?? "Update your profile and service area details to stay visible to customers."}
                </p>
              </div>
              <div className="rounded-3xl bg-brand/5 px-4 py-3 text-sm text-brand/70">
                {form.is_active ? "Active and accepting bookings" : "Inactive listing"}
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Pending" value={stats.pending} />
              <Stat label="Accepted" value={stats.accepted} />
              <Stat label="Completed" value={stats.completed} />
              <Stat label="Earnings" value={`₦${stats.earned.toFixed(0)}`} accent />
            </div>

            <div className="mt-6 rounded-3xl bg-slate-50 p-5 text-sm text-brand/70">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="font-semibold">Service coverage</div>
                  <p className="text-sm text-brand/60">Radius: {form.service_radius_km} km • {form.city || "Set your service city"}</p>
                </div>
                <div className="rounded-full bg-accent/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-accent">{selectedCats.length} categories</div>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            {isAdmin && (
              <div className="rounded-[2rem] bg-white/95 border border-soft p-6 shadow-soft">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm uppercase tracking-[0.24em] text-brand/50">Admin</div>
                    <h3 className="mt-2 text-lg font-semibold">Admin controls</h3>
                  </div>
                  <Link to="/admin" className="rounded-2xl bg-brand px-4 py-3 text-sm font-bold text-white transition hover:bg-brand/90">
                    Open admin
                  </Link>
                </div>
              </div>
            )}

            <div className="rounded-[2rem] bg-white/95 border border-soft p-6 shadow-soft">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm uppercase tracking-[0.24em] text-brand/50">Updates</div>
                  <h3 className="mt-2 text-lg font-semibold">Booking snapshot</h3>
                </div>
                <Link to="/bookings" className="text-sm font-bold uppercase tracking-[0.2em] text-accent">View orders →</Link>
              </div>
              {bookings.length === 0 ? (
                <p className="mt-5 text-sm text-brand/50">No bookings yet. New orders will appear here as customers book your services.</p>
              ) : (
                <div className="mt-5 space-y-3">
                  {bookings.slice(0, 6).map((b: any) => (
                    <article key={b.id} className="rounded-3xl border border-brand/5 bg-glass p-4 shadow-soft">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-brand/40">
                            {b.category?.icon} {b.category?.name}
                          </div>
                          <div className="mt-2 text-sm font-semibold truncate">{b.customer?.full_name ?? "Customer"}</div>
                          <div className="mt-1 text-xs text-brand/60">
                            {new Date(b.scheduled_at).toLocaleString()} • {b.duration_hours}h
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2 text-right">
                          <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${statusStyles[b.status] ?? "bg-slate-100 text-slate-700"}`}>
                            {b.status}
                          </span>
                          {b.total_price && <span className="font-mono text-sm font-bold text-accent">₦{Number(b.total_price).toFixed(0)}</span>}
                        </div>
                      </div>
                      {(b.status === "pending" || b.status === "accepted") && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {b.status === "pending" ? (
                            <>
                              <button onClick={() => updateStatus(b.id, "accepted")} className="flex-1 min-w-[120px] rounded-2xl bg-accent px-3 py-2 text-xs font-bold text-white transition hover:bg-orange-500">
                                Accept
                              </button>
                              <button onClick={() => updateStatus(b.id, "rejected")} className="flex-1 min-w-[120px] rounded-2xl border border-brand/10 bg-white px-3 py-2 text-xs font-bold text-brand transition hover:bg-slate-50">
                                Reject
                              </button>
                            </>
                          ) : (
                            <button onClick={() => updateStatus(b.id, "completed")} className="w-full rounded-2xl bg-brand px-3 py-2 text-xs font-bold text-white transition hover:bg-brand/90">
                              Mark completed
                            </button>
                          )}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        <form onSubmit={save} className="grid gap-4 xl:grid-cols-[1fr_1.05fr]">
          <section className="rounded-[2rem] bg-white/95 border border-soft p-6 shadow-soft">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold">Listing details</h2>
              <label className="flex items-center gap-2 text-sm font-bold text-brand/70">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Active
              </label>
            </div>
            <div className="mt-5 space-y-4">
              <Field label="Business name" required value={form.business_name} onChange={(v) => setForm({ ...form, business_name: v })} />
              <Field label="Bio" textarea value={form.bio} onChange={(v) => setForm({ ...form, bio: v })} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Hourly rate (₦)" value={form.hourly_rate} type="number" onChange={(v) => setForm({ ...form, hourly_rate: v })} />
                <Field label="Service radius (km)" value={String(form.service_radius_km)} type="number" onChange={(v) => setForm({ ...form, service_radius_km: Number(v) || 0 })} />
              </div>
              <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
              <Field label="Availability note" value={form.availability_note} onChange={(v) => setForm({ ...form, availability_note: v })} placeholder="e.g. Available today, 2pm" />
            </div>
          </section>

          <section className="rounded-[2rem] bg-white/95 border border-soft p-6 shadow-soft">
            <h2 className="text-lg font-semibold">Service area</h2>
            <div className="mt-5 space-y-4">
              <Field label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="City" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
                <Field label="ZIP" value={form.zip} onChange={(v) => setForm({ ...form, zip: v })} />
              </div>
              <button type="button" onClick={geocodeAddress} disabled={geocoding} className="w-full rounded-2xl border border-brand/10 bg-white px-4 py-3 text-sm font-bold uppercase tracking-[0.18em] text-brand transition hover:bg-slate-50 disabled:opacity-60 flex items-center justify-center gap-2">
                {geocoding ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}
                {form.latitude ? `Pinned (${form.latitude.toFixed(3)}, ${form.longitude!.toFixed(3)})` : "Pin on map"}
              </button>
            </div>

            <div className="mt-6 rounded-3xl bg-slate-50 p-5">
              <h3 className="text-sm font-semibold text-brand/70">Categories</h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {categories.map((c: any) => {
                  const on = selectedCats.includes(c.id);
                  return (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => setSelectedCats(on ? selectedCats.filter((x) => x !== c.id) : [...selectedCats, c.id])}
                      className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-bold transition ${on ? "bg-brand text-white" : "bg-white border border-brand/10 text-brand"}`}
                    >
                      {c.icon} {c.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <button disabled={saving} className="mt-6 w-full rounded-2xl bg-accent px-4 py-3 text-sm font-bold text-white shadow-lg shadow-accent/20 transition hover:bg-orange-500 disabled:opacity-60 flex items-center justify-center gap-2">
              {saving && <Loader2 className="size-4 animate-spin" />}
              Save listing
            </button>
          </section>
        </form>
      </main>

      <BottomNav />
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className={`rounded-3xl p-5 ${accent ? "bg-gradient-to-br from-accent/10 via-brand/10 to-surface text-brand" : "bg-surface border border-brand/5"}`}>
      <div className={`text-[10px] font-bold uppercase tracking-[0.28em] ${accent ? "text-brand/60" : "text-brand/40"}`}>{label}</div>
      <div className={`mt-3 font-mono font-black text-2xl ${accent ? "text-accent" : "text-brand"}`}>{value}</div>
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
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} placeholder={placeholder} required={required} className="mt-1 w-full rounded-3xl border border-brand/10 bg-canvas px-4 py-3 text-sm text-brand outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/10 resize-none" />
      ) : (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} required={required} className="mt-1 w-full rounded-3xl border border-brand/10 bg-canvas px-4 py-3 text-sm text-brand outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/10" />
      )}
    </label>
  );
}

