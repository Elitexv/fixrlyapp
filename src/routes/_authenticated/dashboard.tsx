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
import { getPaymentStatusBadge, getPaymentStatusLabel } from "@/lib/booking-payment";
import { NotificationsBell } from "@/components/NotificationsBell";
import {
  PageHero,
  Panel,
  Tile,
  StatCard,
  StatusBadge,
  Eyebrow,
  FormField,
  PrimaryButton,
  SecondaryButton,
} from "@/components/ui-kit";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Provider dashboard — Nearby" }, { name: "robots", content: "noindex" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const { user } = useSession();
  const { data: roles = [] } = useRoles(user);
  const isProvider = roles.includes("provider");
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
          <h1 className="text-xl font-black tracking-tight">You're not a provider yet</h1>
          <p className="text-sm text-brand/60 mt-2">Enable provider mode from your profile to list services.</p>
          <Link to="/profile" className="mt-4 inline-flex items-center justify-center gap-2 rounded-2xl bg-accent px-5 py-3 text-sm font-bold text-white shadow-lg shadow-accent/20 transition hover:bg-orange-500">
            Go to profile
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
      <PageHero
        eyebrow="Dashboard"
        title="Provider dashboard"
        description="Manage your listing, availability, bookings, and earnings with clear status cards and quick actions."
        actions={<NotificationsBell />}
      />

      <main className="mx-auto max-w-6xl px-4 -mt-10 space-y-4">
        <div className="grid gap-4 xl:grid-cols-[1.3fr_0.9fr]">
          <Panel>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <Eyebrow>Live status</Eyebrow>
                <h2 className="mt-2 text-2xl font-black tracking-tight">{profile?.business_name ?? "Your provider listing"}</h2>
                <p className="mt-2 text-sm text-brand/60">
                  {profile?.bio ?? "Update your profile and service area details to stay visible to customers."}
                </p>
              </div>
              <div className="rounded-2xl bg-brand/5 px-4 py-3 text-sm font-semibold text-brand/70">
                {form.is_active ? "Active and accepting bookings" : "Inactive listing"}
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Pending" value={stats.pending} />
              <StatCard label="Accepted" value={stats.accepted} />
              <StatCard label="Completed" value={stats.completed} />
              <StatCard label="Earnings" value={`₦${stats.earned.toFixed(0)}`} accent />
            </div>

            <div className="mt-6 rounded-2xl bg-canvas p-5 text-sm text-brand/70">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="font-semibold text-brand">Service coverage</div>
                  <p className="mt-0.5 text-sm text-brand/60">Radius: {form.service_radius_km} km • {form.city || "Set your service city"}</p>
                </div>
                <div className="rounded-full bg-accent/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-accent">{selectedCats.length} categories</div>
              </div>
            </div>
          </Panel>

          <section className="space-y-4">
            <Panel className="p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Eyebrow>Updates</Eyebrow>
                  <h3 className="mt-2 text-lg font-semibold">Booking snapshot</h3>
                </div>
                <Link to="/bookings" className="text-sm font-bold uppercase tracking-[0.2em] text-accent">View orders →</Link>
              </div>
              {bookings.length === 0 ? (
                <p className="mt-5 text-sm text-brand/50">No bookings yet. New orders will appear here as customers book your services.</p>
              ) : (
                <div className="mt-5 space-y-3">
                  {bookings.slice(0, 6).map((b: any) => (
                    <Tile key={b.id} as="article" className="hover:shadow-none">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Eyebrow>{b.category?.icon} {b.category?.name}</Eyebrow>
                          <div className="mt-2 text-sm font-semibold truncate">{b.customer?.full_name ?? "Customer"}</div>
                          <div className="mt-1 text-xs text-brand/60">
                            {new Date(b.scheduled_at).toLocaleString()} • {b.duration_hours}h
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2 text-right">
                          <StatusBadge status={b.status} />
                          {b.total_price && <span className="font-mono text-sm font-bold text-accent">₦{Number(b.total_price).toFixed(0)}</span>}
                          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${getPaymentStatusBadge(b.payment_status)}`}>
                            {getPaymentStatusLabel(b.payment_status)}
                          </span>
                        </div>
                      </div>
                      {(b.status === "pending" || b.status === "accepted") && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {b.status === "pending" ? (
                            <>
                              <PrimaryButton onClick={() => updateStatus(b.id, "accepted")} className="flex-1 min-w-[120px] py-2 text-xs">
                                Accept
                              </PrimaryButton>
                              <SecondaryButton onClick={() => updateStatus(b.id, "rejected")} className="flex-1 min-w-[120px] py-2 text-xs">
                                Reject
                              </SecondaryButton>
                            </>
                          ) : (
                            <button onClick={() => updateStatus(b.id, "completed")} className="w-full rounded-2xl bg-brand px-3 py-2 text-xs font-bold text-white transition hover:bg-brand/90">
                              Mark completed
                            </button>
                          )}
                        </div>
                      )}
                    </Tile>
                  ))}
                </div>
              )}
            </Panel>
          </section>
        </div>

        <form onSubmit={save} className="grid gap-4 xl:grid-cols-[1fr_1.05fr]">
          <Panel>
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold">Listing details</h2>
              <label className="flex items-center gap-2 text-sm font-bold text-brand/70">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Active
              </label>
            </div>
            <div className="mt-5 space-y-4">
              <FormField label="Business name" required value={form.business_name} onChange={(v) => setForm({ ...form, business_name: v })} />
              <FormField label="Bio" textarea value={form.bio} onChange={(v) => setForm({ ...form, bio: v })} />
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Hourly rate (₦)" value={form.hourly_rate} type="number" onChange={(v) => setForm({ ...form, hourly_rate: v })} />
                <FormField label="Service radius (km)" value={String(form.service_radius_km)} type="number" onChange={(v) => setForm({ ...form, service_radius_km: Number(v) || 0 })} />
              </div>
              <FormField label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
              <FormField label="Availability note" value={form.availability_note} onChange={(v) => setForm({ ...form, availability_note: v })} placeholder="e.g. Available today, 2pm" />
            </div>
          </Panel>

          <Panel>
            <h2 className="text-lg font-semibold">Service area</h2>
            <div className="mt-5 space-y-4">
              <FormField label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="City" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
                <FormField label="ZIP" value={form.zip} onChange={(v) => setForm({ ...form, zip: v })} />
              </div>
              <SecondaryButton type="button" onClick={geocodeAddress} disabled={geocoding} className="w-full uppercase tracking-[0.18em]">
                {geocoding ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}
                {form.latitude ? `Pinned (${form.latitude.toFixed(3)}, ${form.longitude!.toFixed(3)})` : "Pin on map"}
              </SecondaryButton>
            </div>

            <div className="mt-6 rounded-2xl bg-canvas p-5">
              <h3 className="text-sm font-semibold text-brand/70">Categories</h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {categories.map((c: any) => {
                  const on = selectedCats.includes(c.id);
                  return (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => setSelectedCats(on ? selectedCats.filter((x) => x !== c.id) : [...selectedCats, c.id])}
                      className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-bold transition ${on ? "bg-brand text-white" : "bg-white border border-brand/10 text-brand hover:border-accent/30"}`}
                    >
                      {c.icon} {c.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <PrimaryButton disabled={saving} loading={saving} className="mt-6 w-full">
              Save listing
            </PrimaryButton>
          </Panel>
        </form>
      </main>

      <BottomNav />
    </div>
  );
}

