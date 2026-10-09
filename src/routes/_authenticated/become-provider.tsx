import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession, useRoles } from "@/lib/session";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { geocodeLocation } from "@/lib/geocode.functions";
import { BottomNav } from "@/components/BottomNav";
import { toast } from "sonner";
import { Loader2, MapPin, ArrowRight, ArrowLeft, CheckCircle2, Upload, FileCheck2, Clock, XCircle, Check } from "lucide-react";
import { AppTopBar } from "@/components/AppTopBar";
import { CategoryIcon } from "@/components/CategoryVisual";
import { currencySymbol, useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";

const card = "rounded-2xl border border-soft bg-surface shadow-[0_8px_30px_rgba(15,23,42,0.06)]";
const STEPS = ["Business", "Services", "Service area", "Verification"];

// Centered status card for the already-provider / pending / rejected states.
function StatusScreen({ icon, tone, title, children }: { icon: React.ReactNode; tone: string; title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas text-brand pb-28 lg:pb-12">
      <AppTopBar />
      <div className="grid min-h-[70vh] place-items-center px-6">
        <div className={cn(card, "w-full max-w-sm p-8 text-center")}>
          <span className={cn("mx-auto grid size-14 place-items-center rounded-full", tone)}>{icon}</span>
          <h1 className="mt-4 text-xl font-bold tracking-tight">{title}</h1>
          {children}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}

const primaryBtn =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent to-orange-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-accent/25 transition hover:brightness-105 disabled:opacity-60";

export const Route = createFileRoute("/_authenticated/become-provider")({
  head: () => ({ meta: [{ title: "Become a provider — Fixrly" }, { name: "robots", content: "noindex" }] }),
  component: BecomeProviderPage,
});

function BecomeProviderPage() {
  const { user } = useSession();
  const { data: roles = [] } = useRoles(user);
  const isProvider = roles.includes("provider");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const geocode = useServerFn(geocodeLocation);
  const currency = useCurrency();

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data } = await supabase.from("service_categories").select("id,slug,name,icon").order("sort_order");
      return data ?? [];
    },
  });

  const { data: existingRequest, isLoading: reqLoading } = useQuery({
    queryKey: ["my-provider-request", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("provider_requests")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [uploadingId, setUploadingId] = useState<"service" | "national" | null>(null);
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [form, setForm] = useState({
    business_name: "",
    bio: "",
    phone: "",
    hourly_rate: "",
    service_radius_km: 25,
    address: "",
    city: "",
    zip: "",
    availability_note: "",
    latitude: null as number | null,
    longitude: null as number | null,
    service_id_url: "" as string,
    national_id_url: "" as string,
  });

  if (isProvider) {
    return (
      <StatusScreen icon={<CheckCircle2 className="size-7" />} tone="bg-green-50 text-green-600 dark:bg-green-500/15" title="You're already a provider">
        <p className="text-sm text-brand/60 mt-2">Manage your listing and orders from the dashboard.</p>
        <Link to="/dashboard" className={cn(primaryBtn, "mt-5")}>
          Open dashboard <ArrowRight className="size-4" />
        </Link>
      </StatusScreen>
    );
  }

  if (reqLoading) {
    return <div className="min-h-screen grid place-items-center bg-canvas"><Loader2 className="animate-spin size-6 text-brand/40" /></div>;
  }

  if (existingRequest && existingRequest.status === "pending") {
    return (
      <StatusScreen icon={<Clock className="size-7" />} tone="bg-amber-50 text-amber-600 dark:bg-amber-500/15" title="Request under review">
        <p className="text-sm text-brand/60 mt-2">
          Thanks for applying! An admin is reviewing your details and ID documents. You'll be notified once approved.
        </p>
        <dl className="mt-5 space-y-2 rounded-xl border border-soft bg-canvas p-4 text-left text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-brand/55">Business</dt>
            <dd className="truncate font-semibold">{existingRequest.business_name}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-brand/55">Submitted</dt>
            <dd className="font-semibold">{new Date(existingRequest.created_at).toLocaleDateString(undefined, { dateStyle: "medium" })}</dd>
          </div>
        </dl>
      </StatusScreen>
    );
  }

  if (existingRequest && existingRequest.status === "rejected") {
    return (
      <StatusScreen icon={<XCircle className="size-7" />} tone="bg-red-50 text-red-600 dark:bg-red-500/15" title="Request not approved">
        {existingRequest.review_notes && (
          <p className="mt-3 rounded-xl bg-canvas p-3 text-sm text-brand/70">"{existingRequest.review_notes}"</p>
        )}
        <p className="text-sm text-brand/60 mt-3">You can update your details and apply again.</p>
        <button
          type="button"
          onClick={async () => {
            await supabase.from("provider_requests").delete().eq("id", existingRequest.id);
            qc.invalidateQueries({ queryKey: ["my-provider-request", user?.id] });
          }}
          className={cn(primaryBtn, "mt-5")}
        >
          Submit new request
        </button>
      </StatusScreen>
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

  const uploadFile = async (file: File, kind: "service" | "national") => {
    if (!user) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("Max file size is 5 MB");
    setUploadingId(kind);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `${user.id}/${kind}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("provider-docs").upload(path, file, { upsert: true });
      if (error) throw error;
      setForm((f) => ({
        ...f,
        [kind === "service" ? "service_id_url" : "national_id_url"]: path,
      }));
      toast.success(`${kind === "service" ? "Service ID" : "National ID"} uploaded`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploadingId(null);
    }
  };

  const submit = async () => {
    if (!form.business_name) return toast.error("Business name is required");
    if (selectedCats.length === 0) return toast.error("Pick at least one category");
    if (!form.service_id_url) return toast.error("Upload your Service ID card");
    if (!form.national_id_url) return toast.error("Upload your National ID");
    setSaving(true);
    try {
      // "Pin location" is easy to skip — if the applicant typed an address
      // but never clicked it, geocode it now so distance-to-customer and
      // map markers work once the listing goes live, instead of silently
      // shipping with no coordinates.
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
            /* best-effort — submit without coordinates rather than block */
          }
        }
      }

      const { error } = await supabase.from("provider_requests").insert({
        user_id: user!.id,
        business_name: form.business_name,
        bio: form.bio || null,
        phone: form.phone || null,
        hourly_rate: form.hourly_rate ? Number(form.hourly_rate) : null,
        service_radius_km: form.service_radius_km,
        address: form.address || null,
        city: form.city || null,
        zip: form.zip || null,
        availability_note: form.availability_note || null,
        latitude,
        longitude,
        category_ids: selectedCats,
        service_id_url: form.service_id_url,
        national_id_url: form.national_id_url,
      });
      if (error) throw error;
      toast.success("Request submitted! An admin will review it shortly.");
      qc.invalidateQueries({ queryKey: ["my-provider-request", user!.id] });
      navigate({ to: "/profile" });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const next = () => {
    if (step === 1 && !form.business_name) return toast.error("Business name is required");
    if (step === 2 && selectedCats.length === 0) return toast.error("Pick at least one category");
    setStep(step + 1);
  };

  return (
    <div className="min-h-screen bg-canvas pb-32 text-brand lg:pb-12">
      <AppTopBar />

      <div className="mx-auto max-w-2xl lg:pt-6">
        <header className="relative overflow-hidden bg-[#0b1730] px-4 pt-[max(env(safe-area-inset-top),1.25rem)] pb-6 text-white lg:rounded-2xl lg:p-7">
          <div className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full bg-accent/25 blur-3xl" />
          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">Step {step} of 4</p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Become a Provider</h1>
            <p className="mt-1 text-sm text-white/70">An admin reviews every application before your listing goes live.</p>
            <ol className="mt-5 grid grid-cols-4 gap-2" aria-label="Application steps">
              {STEPS.map((label, i) => {
                const n = i + 1;
                const done = n < step;
                const current = n === step;
                return (
                  <li key={label} aria-current={current ? "step" : undefined}>
                    <div className={cn("h-1.5 rounded-full", n <= step ? "bg-accent" : "bg-white/15")} />
                    <div className={cn("mt-2 flex items-center gap-1 text-[11px] font-medium", current ? "text-white" : "text-white/55")}>
                      {done && <Check className="size-3 text-accent" strokeWidth={3} />}
                      <span className="truncate">{label}</span>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </header>

        <div className="space-y-4 px-4 pt-4 lg:px-0">
          {step === 1 && (
            <section className={cn(card, "space-y-4 p-5")}>
              <h2 className="text-base font-bold">About your business</h2>
              <Field label="Business name" required value={form.business_name} onChange={(v) => setForm({ ...form, business_name: v })} />
              <Field label="Short bio" textarea value={form.bio} onChange={(v) => setForm({ ...form, bio: v })} placeholder="What makes you great at what you do?" />
              <Field label="Contact phone" type="tel" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
              <div className="grid grid-cols-2 gap-3">
                <Field label={`Hourly rate (${currencySymbol(currency)})`} type="number" value={form.hourly_rate} onChange={(v) => setForm({ ...form, hourly_rate: v })} />
                <Field label="Availability" value={form.availability_note} onChange={(v) => setForm({ ...form, availability_note: v })} placeholder="e.g. Mon – Sat" />
              </div>
            </section>
          )}

          {step === 2 && (
            <section className={cn(card, "space-y-3 p-5")}>
              <h2 className="text-base font-bold">Services you offer</h2>
              <p className="text-sm text-brand/60">Pick everything that applies. Customers browse by these.</p>
              <div className="grid grid-cols-2 gap-2.5 pt-1 sm:grid-cols-3">
                {categories.map((c: any) => {
                  const on = selectedCats.includes(c.id);
                  return (
                    <button
                      type="button"
                      key={c.id}
                      aria-pressed={on}
                      onClick={() => setSelectedCats(on ? selectedCats.filter((x) => x !== c.id) : [...selectedCats, c.id])}
                      className={cn(
                        "relative flex items-center gap-2.5 rounded-xl border p-3 text-left text-sm font-semibold transition",
                        on ? "border-accent bg-orange-50/70 ring-2 ring-accent/15 dark:bg-orange-500/10" : "border-soft bg-surface hover:border-accent/30",
                      )}
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-orange-50 dark:bg-orange-500/10">
                        <CategoryIcon slug={c.slug ?? ""} emoji={c.icon} className="size-[18px] text-lg" />
                      </span>
                      <span className="min-w-0 flex-1 leading-snug">{c.name}</span>
                      {on && (
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

          {step === 3 && (
            <section className={cn(card, "space-y-4 p-5")}>
              <h2 className="text-base font-bold">Service area</h2>
              <Field label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v, latitude: null, longitude: null })} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="City" value={form.city} onChange={(v) => setForm({ ...form, city: v, latitude: null, longitude: null })} />
                <Field label="ZIP" value={form.zip} onChange={(v) => setForm({ ...form, zip: v, latitude: null, longitude: null })} />
              </div>
              <Field label="Travel radius (km)" type="number" value={String(form.service_radius_km)} onChange={(v) => setForm({ ...form, service_radius_km: Number(v) || 0 })} />
              <button
                type="button"
                onClick={geocodeAddress}
                disabled={geocoding}
                className={cn(
                  "flex h-11 w-full items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition disabled:opacity-60",
                  form.latitude != null
                    ? "border-green-200 bg-green-50 text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-400"
                    : "border-soft hover:bg-canvas",
                )}
              >
                {geocoding ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}
                {form.latitude != null ? "Pinned on map · Re-pin" : "Pin location on map"}
              </button>
            </section>
          )}

          {step === 4 && (
            <section className={cn(card, "space-y-3 p-5")}>
              <h2 className="text-base font-bold">Verification documents</h2>
              <p className="text-sm text-brand/60">Upload clear photos or scans. Only admins can view them (max 5 MB each).</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <UploadField
                  label="Service ID card"
                  required
                  filled={!!form.service_id_url}
                  loading={uploadingId === "service"}
                  onFile={(f) => uploadFile(f, "service")}
                />
                <UploadField
                  label="National ID"
                  required
                  filled={!!form.national_id_url}
                  loading={uploadingId === "national"}
                  onFile={(f) => uploadFile(f, "national")}
                />
              </div>
            </section>
          )}

          <div className="flex gap-2.5 pt-1">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="flex h-12 items-center justify-center gap-2 rounded-xl border border-soft bg-surface px-5 text-sm font-semibold transition hover:bg-canvas"
              >
                <ArrowLeft className="size-4" /> Back
              </button>
            )}
            {step < 4 ? (
              <button type="button" onClick={next} className={cn(primaryBtn, "h-12 flex-1")}>
                Continue <ArrowRight className="size-4" />
              </button>
            ) : (
              <button type="button" onClick={submit} disabled={saving} className={cn(primaryBtn, "h-12 flex-1")}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                Submit for review
              </button>
            )}
          </div>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}

const fieldClass =
  "mt-1.5 w-full rounded-xl border border-soft bg-canvas px-3.5 py-2.5 text-sm outline-none transition focus:border-accent/50 focus:ring-4 focus:ring-accent/10";

function Field({
  label, value, onChange, type = "text", required, textarea, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; textarea?: boolean; placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">
        {label}
        {required && <span className="text-accent"> *</span>}
      </span>
      {textarea ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} placeholder={placeholder} required={required} className={cn(fieldClass, "resize-none")} />
      ) : (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} required={required} className={fieldClass} />
      )}
    </label>
  );
}

function UploadField({
  label, required, filled, loading, onFile,
}: {
  label: string; required?: boolean; filled: boolean; loading: boolean; onFile: (f: File) => void;
}) {
  return (
    <label
      className={cn(
        "block cursor-pointer rounded-xl border-2 border-dashed p-5 text-center transition",
        filled ? "border-green-300 bg-green-50 dark:border-green-500/40 dark:bg-green-500/10" : "border-brand/15 hover:border-accent/40 hover:bg-orange-50/40",
      )}
    >
      <input
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
      {loading ? (
        <Loader2 className="size-6 animate-spin mx-auto text-brand/40" />
      ) : filled ? (
        <FileCheck2 className="size-6 mx-auto text-green-600" />
      ) : (
        <Upload className="size-6 mx-auto text-brand/40" />
      )}
      <div className="mt-2 text-sm font-semibold">
        {label}
        {required && <span className="text-accent"> *</span>}
      </div>
      <div className="mt-0.5 text-xs text-brand/50">
        {filled ? "Uploaded — tap to replace" : "Tap to select image or PDF"}
      </div>
    </label>
  );
}
